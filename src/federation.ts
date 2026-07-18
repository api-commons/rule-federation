// Rule Federation — the model and the math.
//
// A federated rule registry is a CENTRAL baseline ruleset plus the DOMAINS that
// adopt it. Each domain adopts a central rule by reference, but may override its
// severity (with a reason), waive it, defer it, or grow a LOCAL rule the center
// should think about promoting. This module parses that model and computes the
// federation: divergence per rule, drift per domain, and the health signals that
// tell a steward where the conversation needs to happen.
//
// It is deliberately transport-agnostic — the whole model is one JSON/YAML file
// you keep in Git, in the spirit of the German FAAI model (a small accountable
// central baseline, fine-grained decisions federated into the domains, and every
// decision written down with a rationale and a linked conversation).
import { parse as parseYaml } from 'yaml';

export type Severity = 'error' | 'warn' | 'info' | 'hint' | 'off';
export type AdoptionState = 'inherit' | 'override' | 'waived' | 'deferred' | 'local';

export interface CentralRule {
  code: string;
  name?: string;
  severity: Severity; // the baseline the center holds
  docUrl?: string;
  steward?: string; // who owns this rule centrally
  rationale?: string; // why the pattern this rule governs matters
  conversation?: string; // the issue/PR where it's discussed
  version?: string;
  since?: string;
  roadmap?: string; // a planned change to the rule
}

export interface Adoption {
  code: string; // references a central rule, or (for local) the domain's own code
  state: AdoptionState;
  severity?: Severity; // present for override/local
  reason?: string; // why the domain deviates
  conversation?: string;
  // local-rule fields:
  name?: string;
  rationale?: string;
  steward?: string;
  proposePromotion?: boolean; // the domain wants the center to adopt this
}

export interface Domain {
  id: string;
  name?: string;
  steward?: string;
  repo?: string;
  adoptVia?: string; // copy-paste extends/npm snippet
  adoptions?: Adoption[];
}

export interface Federation {
  version?: string;
  central: { name?: string; owner?: string; url?: string; rules: CentralRule[] };
  domains: Domain[];
}

// ---- parsing -------------------------------------------------------------

export function parseFederation(text: string): Federation {
  const t = (text || '').trim();
  if (!t) throw new Error('Empty input.');
  let doc: any;
  try { doc = t[0] === '{' ? JSON.parse(t) : parseYaml(t); }
  catch (e) { throw new Error((e as Error).message); }
  if (!doc || typeof doc !== 'object') throw new Error('Expected a federation object.');
  if (!doc.central || !Array.isArray(doc.central.rules)) throw new Error('Missing central.rules[] — the baseline ruleset.');
  if (!Array.isArray(doc.domains)) throw new Error('Missing domains[] — the federations that adopt the baseline.');
  return doc as Federation;
}

// ---- severity ordering ---------------------------------------------------

const RANK: Record<Severity, number> = { off: 0, hint: 1, info: 2, warn: 3, error: 4 };
export const SEVERITIES: Severity[] = ['error', 'warn', 'info', 'hint', 'off'];
export function sevRank(s: Severity): number { return RANK[s] ?? 0; }

// ---- computed views ------------------------------------------------------

export type CellKind = 'inherit' | 'stricter' | 'looser' | 'waived' | 'deferred' | 'unadopted';

export interface Cell {
  domainId: string;
  kind: CellKind;
  effective: Severity | null; // null = not enforced (waived/deferred/unadopted)
  reason?: string;
  conversation?: string;
}

export interface RuleRow {
  rule: CentralRule;
  cells: Cell[];
  // breakdown across domains
  inherit: number; stricter: number; looser: number; waived: number; deferred: number; unadopted: number;
  positions: number; // domains that took a position (not unadopted)
  divergence: number; // domains that deviate from baseline / positions (0..1)
  // health flags
  contested: boolean; // enough divergence that the rule needs a variation or better storytelling
  unstewarded: boolean;
  undocumented: boolean; // no rationale and no linked conversation
  orphan: boolean; // enforced nowhere
}

export interface LocalRule {
  domainId: string; domainName: string; adoption: Adoption; alsoIn: string[]; // other domains with the same code
}

export interface DomainRow {
  domain: Domain;
  positions: number; // central rules the domain took a position on
  enforced: number; // inherit + override (actively linting)
  deviates: number; // override + waived + deferred
  drift: number; // deviates / positions (0..1)
  coverage: number; // positions / central rule count (0..1)
  locals: number;
  promotions: number;
  unstewarded: boolean;
  undocumentedDeviations: number; // deviations with no reason given
}

export interface FederationReport {
  central: Federation['central'];
  domains: Domain[];
  ruleRows: RuleRow[];
  domainRows: DomainRow[];
  localRules: LocalRule[];
  promotionCandidates: LocalRule[];
  totals: {
    rules: number; domains: number; cells: number; enforcedCells: number;
    coverage: number; // enforcedCells / cells
    contested: number; unstewarded: number; undocumented: number; orphan: number;
    locals: number; promotions: number; undocumentedDeviations: number;
  };
}

const CONTESTED_THRESHOLD = 0.34; // a third+ of the domains that weighed in disagree with the center

export function computeFederation(f: Federation, contested = CONTESTED_THRESHOLD): FederationReport {
  const domains = f.domains;
  const rules = f.central.rules;

  // index each domain's adoptions by code
  const byDomain = new Map<string, Map<string, Adoption>>();
  for (const d of domains) {
    const m = new Map<string, Adoption>();
    for (const a of d.adoptions ?? []) m.set(a.code, a);
    byDomain.set(d.id, m);
  }

  // ----- rule rows (the matrix) -----
  const ruleRows: RuleRow[] = rules.map((rule) => {
    const cells: Cell[] = domains.map((d) => cellFor(rule, byDomain.get(d.id)!.get(rule.code), d.id));
    const tally = { inherit: 0, stricter: 0, looser: 0, waived: 0, deferred: 0, unadopted: 0 };
    for (const c of cells) tally[c.kind]++;
    const positions = cells.length - tally.unadopted;
    const deviating = tally.stricter + tally.looser + tally.waived + tally.deferred;
    const divergence = positions ? deviating / positions : 0;
    const enforcedAnywhere = tally.inherit + tally.stricter + tally.looser > 0;
    return {
      rule, cells, ...tally, positions, divergence,
      contested: positions >= 2 && divergence >= contested,
      unstewarded: !rule.steward,
      undocumented: !rule.rationale && !rule.conversation,
      orphan: !enforcedAnywhere,
    };
  });

  // ----- domain rows -----
  const domainRows: DomainRow[] = domains.map((d) => {
    const m = byDomain.get(d.id)!;
    let positions = 0, enforced = 0, deviates = 0, undocumentedDeviations = 0;
    for (const rule of rules) {
      const a = m.get(rule.code);
      const kind = cellFor(rule, a, d.id).kind;
      if (kind === 'unadopted') continue;
      positions++;
      if (kind === 'inherit' || kind === 'stricter' || kind === 'looser') enforced++;
      if (kind === 'stricter' || kind === 'looser' || kind === 'waived' || kind === 'deferred') {
        deviates++;
        if (!a?.reason) undocumentedDeviations++;
      }
    }
    const locals = (d.adoptions ?? []).filter((a) => a.state === 'local');
    return {
      domain: d, positions, enforced, deviates,
      drift: positions ? deviates / positions : 0,
      coverage: rules.length ? positions / rules.length : 0,
      locals: locals.length,
      promotions: locals.filter((a) => a.proposePromotion).length,
      unstewarded: !d.steward,
      undocumentedDeviations,
    };
  });

  // ----- local rules & promotion candidates -----
  const localRules: LocalRule[] = [];
  const localCodeIndex = new Map<string, string[]>();
  for (const d of domains) for (const a of d.adoptions ?? []) if (a.state === 'local') {
    localCodeIndex.set(a.code, [...(localCodeIndex.get(a.code) ?? []), d.id]);
  }
  for (const d of domains) for (const a of d.adoptions ?? []) if (a.state === 'local') {
    const alsoIn = (localCodeIndex.get(a.code) ?? []).filter((id) => id !== d.id);
    localRules.push({ domainId: d.id, domainName: d.name || d.id, adoption: a, alsoIn });
  }
  // a local rule is a promotion candidate if the domain proposed it, or if two+
  // domains independently grew the same rule (the center is missing a baseline).
  const promotionCandidates = localRules.filter((l) => l.adoption.proposePromotion || l.alsoIn.length > 0);

  const cells = ruleRows.reduce((n, r) => n + r.cells.length, 0);
  const enforcedCells = ruleRows.reduce((n, r) => n + r.inherit + r.stricter + r.looser, 0);
  const totals = {
    rules: rules.length, domains: domains.length, cells, enforcedCells,
    coverage: cells ? enforcedCells / cells : 0,
    contested: ruleRows.filter((r) => r.contested).length,
    unstewarded: ruleRows.filter((r) => r.unstewarded).length,
    undocumented: ruleRows.filter((r) => r.undocumented).length,
    orphan: ruleRows.filter((r) => r.orphan).length,
    locals: localRules.length,
    promotions: promotionCandidates.length,
    undocumentedDeviations: domainRows.reduce((n, d) => n + d.undocumentedDeviations, 0),
  };

  return { central: f.central, domains, ruleRows, domainRows, localRules, promotionCandidates, totals };
}

function cellFor(rule: CentralRule, a: Adoption | undefined, domainId: string): Cell {
  if (!a || a.state === 'local') return { domainId, kind: 'unadopted', effective: null };
  if (a.state === 'waived') return { domainId, kind: 'waived', effective: null, reason: a.reason, conversation: a.conversation };
  if (a.state === 'deferred') return { domainId, kind: 'deferred', effective: null, reason: a.reason, conversation: a.conversation };
  if (a.state === 'inherit') return { domainId, kind: 'inherit', effective: rule.severity, conversation: a.conversation };
  // override
  const sev = a.severity ?? rule.severity;
  const kind: CellKind = sevRank(sev) > sevRank(rule.severity) ? 'stricter' : sevRank(sev) < sevRank(rule.severity) ? 'looser' : 'inherit';
  return { domainId, kind, effective: sev, reason: a.reason, conversation: a.conversation };
}
