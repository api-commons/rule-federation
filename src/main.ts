import './style.css';
import { initEngage } from './engage';
import {
  parseFederation, computeFederation,
  type Federation, type FederationReport, type RuleRow, type Cell, type Severity, type CellKind,
} from './federation';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const val = (s: string) => ($(s) as HTMLTextAreaElement | HTMLInputElement).value;
const setVal = (s: string, v: string) => { ($(s) as HTMLTextAreaElement | HTMLInputElement).value = v; };
const pct = (n: number) => `${Math.round(n * 100)}%`;

const SEV_ABBR: Record<Severity, string> = { error: 'E', warn: 'W', info: 'I', hint: 'H', off: '—' };
const KIND_LABEL: Record<CellKind, string> = { inherit: 'as baseline', stricter: 'stricter', looser: 'looser', waived: 'waived', deferred: 'deferred', unadopted: 'not adopted' };

let sample = '';
let lastReport: FederationReport | null = null;

init();
async function init() {
  wire();
  initEngage(engageContext);
  try {
    sample = await fetch(`${import.meta.env.BASE_URL}federation.json`).then((r) => r.text());
    setVal('#model-text', sample);
    run();
  } catch (e) { err(`Couldn't load the sample model. ${(e as Error).message}`); }
}

function wire() {
  $('#compute').addEventListener('click', run);
  $('#load-sample').addEventListener('click', () => { setVal('#model-text', sample); run(); });
  $('#up-model').addEventListener('click', () => $('#file-model').click());
  $('#file-model').addEventListener('change', readFile);
  $('#dl-model').addEventListener('click', downloadModel);
  $('#dl-model2').addEventListener('click', downloadModel);
  $('#focus').addEventListener('change', () => { if (lastReport) render(lastReport); });
  $('#nav-about').addEventListener('click', (e) => { e.preventDefault(); about(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('detail-modal')?.remove(); });
}

function readFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { setVal('#model-text', String(r.result)); run(); }; r.readAsText(f);
}
function downloadModel() { download('federation.json', val('#model-text'), 'application/json'); }

function run() {
  let fed: Federation;
  try { fed = parseFederation(val('#model-text')); }
  catch (e) { return err(`Couldn't parse the model: ${(e as Error).message}`); }
  let rep: FederationReport;
  try { rep = computeFederation(fed); }
  catch (e) { return err(`Couldn't compute the federation: ${(e as Error).message}`); }
  lastReport = rep;
  const t = rep.totals;
  $('#status').innerHTML = `<b>${t.rules}</b> rules · <b>${t.domains}</b> domains · <b style="color:${t.contested ? 'var(--warn)' : 'var(--ok)'}">${t.contested}</b> contested · <b>${t.promotions}</b> to promote`;
  render(rep);
}
function err(msg: string) { $('#report').innerHTML = `<div class="cov-error">${esc(msg)}</div>`; lastReport = null; }

function engageContext(): string {
  if (!lastReport) return 'Looking at Rule Federation.';
  const t = lastReport.totals;
  return `Context: a federation of ${t.rules} central rules across ${t.domains} domains — ${pct(t.coverage)} enforced coverage, ${t.contested} contested rules, ${t.unstewarded} unstewarded, ${t.undocumented} undocumented, ${t.orphan} orphaned, and ${t.promotions} local rules proposed for promotion.`;
}

// ---------- render ----------
function render(rep: FederationReport) {
  const t = rep.totals;
  const focus = ($('#focus') as HTMLSelectElement).value;
  const rows = rep.ruleRows.filter((r) =>
    focus === 'all' ? true :
    focus === 'contested' ? r.contested :
    focus === 'unstewarded' ? r.unstewarded :
    focus === 'undocumented' ? r.undocumented :
    focus === 'orphan' ? r.orphan : true);

  $('#report').innerHTML = `
    <div class="hero">
      <div class="gauge">
        <div class="gauge-num" style="color:${t.coverage >= 0.75 ? 'var(--ok)' : t.coverage >= 0.5 ? 'var(--warn)' : 'var(--error)'}">${pct(t.coverage)}</div>
        <div class="gauge-cap">of the ${t.cells} rule×domain<br>cells are actively enforced</div>
      </div>
      <div class="facts">
        <div class="fact"><b>${t.rules}</b><span>central rules</span></div>
        <div class="fact"><b>${t.domains}</b><span>domains</span></div>
        <div class="fact ${t.contested ? 'warnf' : ''}"><b>${t.contested}</b><span>contested rules</span></div>
        <div class="fact ${t.unstewarded ? 'warnf' : ''}"><b>${t.unstewarded}</b><span>unstewarded rules</span></div>
        <div class="fact ${t.undocumented ? 'warnf' : ''}"><b>${t.undocumented}</b><span>undocumented rules</span></div>
        <div class="fact ${t.orphan ? 'errf' : ''}"><b>${t.orphan}</b><span>orphaned rules</span></div>
        <div class="fact"><b>${t.locals}</b><span>local rules</span></div>
        <div class="fact ${t.promotions ? 'okf' : ''}"><b>${t.promotions}</b><span>to promote ↑</span></div>
      </div>
    </div>
    <p class="hint small">A federated rule registry is a <strong>central baseline</strong> plus the <strong>domains that adopt it</strong>. The center holds a small, accountable set of rules; each domain adopts them by reference and can <strong>override severity, waive, or defer</strong> — with a reason and a linked conversation — or grow a <strong>local rule</strong> the center should think about promoting. The signals below show where the federation needs a decision, a steward, or a story.</p>

    <section class="panel matrix-panel">
      <h3>Federation matrix <span class="muted">(${rows.length}${rows.length !== rep.ruleRows.length ? ` of ${rep.ruleRows.length}` : ''} rules × ${rep.domains.length} domains)</span></h3>
      <p class="small">Central severity on the left; each cell is a domain's position. Click a rule to see the rationale, the conversation, and every domain's reason.</p>
      ${matrix(rep, rows)}
      ${legend()}
    </section>

    <div class="cols">
      ${hotspots(rep)}
      ${promotions(rep)}
    </div>
    <div class="cols">
      ${domainDrift(rep)}
      ${attention(rep)}
    </div>

    <div class="export-bar">
      <button class="ghost-btn" id="dl-model3" type="button">Download model.json ↓</button>
      <span class="muted small">Keep the model in Git next to your rulesets — the federation is data, not a slideshow.</span>
    </div>`;

  $('#dl-model3').addEventListener('click', downloadModel);
  document.querySelectorAll<HTMLElement>('[data-rule]').forEach((el) =>
    el.addEventListener('click', () => ruleDetail(rep, el.dataset.rule!)));
}

function matrix(rep: FederationReport, rows: RuleRow[]): string {
  if (!rows.length) return `<p class="muted small" style="padding:.6rem 0">No rules match this focus.</p>`;
  const head = `<div class="mx-row mx-head"><div class="mx-rule">Rule <span class="muted">(central)</span></div>${rep.domains.map((d) => `<div class="mx-cell mx-domain" title="${esc(d.name || d.id)}${d.steward ? ' · steward ' + esc(d.steward) : ' · no steward'}">${esc(d.name || d.id)}${d.steward ? '' : ' <span class="nostew">⚑</span>'}</div>`).join('')}</div>`;
  const body = rows.map((r) => {
    const flags = [
      r.contested ? '<span class="rflag contested" title="A third or more of the domains that weighed in deviate — this rule needs a variation or better storytelling">contested</span>' : '',
      r.unstewarded ? '<span class="rflag unstew" title="No central steward owns this rule">unstewarded</span>' : '',
      r.undocumented ? '<span class="rflag undoc" title="No rationale and no linked conversation — nobody can say why this rule exists">undocumented</span>' : '',
      r.orphan ? '<span class="rflag orphan" title="Enforced by no domain — dead weight in the baseline">orphaned</span>' : '',
    ].filter(Boolean).join('');
    return `<div class="mx-row" data-rule="${esc(r.rule.code)}">
      <div class="mx-rule">
        <div class="mx-rule-top"><span class="sev sev-${r.rule.severity}" title="central baseline severity">${SEV_ABBR[r.rule.severity]}</span><span class="mx-code">${esc(r.rule.code)}</span></div>
        <div class="mx-name">${esc(r.rule.name || '')}</div>
        ${flags ? `<div class="mx-flags">${flags}</div>` : ''}
      </div>
      ${r.cells.map((c) => cell(c, r.rule.severity)).join('')}
    </div>`;
  }).join('');
  const gtc = `minmax(220px,1.6fr) repeat(${rep.domains.length},minmax(74px,1fr))`;
  return `<div class="matrix" style="--gtc:${gtc}">${head}${body}</div>`;
}

function cell(c: Cell, baseline: Severity): string {
  const label = c.effective ? SEV_ABBR[c.effective] : c.kind === 'waived' ? '×' : c.kind === 'deferred' ? '⏸' : '·';
  const arrow = c.kind === 'stricter' ? ' ↑' : c.kind === 'looser' ? ' ↓' : '';
  const title = `${KIND_LABEL[c.kind]}${c.effective ? ` (${c.effective}${c.kind !== 'inherit' ? ` vs ${baseline}` : ''})` : ''}${c.reason ? ` — ${c.reason}` : ''}`;
  return `<div class="mx-cell k-${c.kind}" title="${esc(title)}"><span class="mx-val">${esc(label)}${arrow}</span>${c.reason ? '<span class="mx-dot" title="reason on record"></span>' : c.kind !== 'inherit' && c.kind !== 'unadopted' ? '<span class="mx-dot no" title="no reason on record"></span>' : ''}</div>`;
}

function legend(): string {
  const items: [CellKind, string][] = [['inherit', 'as baseline'], ['stricter', 'override ↑'], ['looser', 'override ↓'], ['waived', 'waived'], ['deferred', 'deferred'], ['unadopted', 'not adopted']];
  return `<div class="legend">${items.map(([k, l]) => `<span class="lg"><span class="lg-sw k-${k}"></span>${l}</span>`).join('')}<span class="lg"><span class="mx-dot"></span>reason on record</span><span class="lg"><span class="mx-dot no"></span>none</span></div>`;
}

function hotspots(rep: FederationReport): string {
  const list = rep.ruleRows.filter((r) => r.contested).sort((a, b) => b.divergence - a.divergence);
  return `<section class="panel">
    <h3>Contested rules <span class="muted">(${list.length})</span></h3>
    <p class="small">The center says one thing; the domains keep saying another. Each of these needs a decision: a sanctioned <em>variation</em>, a change to the baseline, or better storytelling about why the pattern matters.</p>
    ${list.length ? `<div class="stack">${list.map((r) => `
      <div class="row-card" data-rule="${esc(r.rule.code)}">
        <div class="rc-top"><span class="sev sev-${r.rule.severity}">${SEV_ABBR[r.rule.severity]}</span><span class="rc-code">${esc(r.rule.code)}</span><span class="rc-div">${pct(r.divergence)} diverge</span></div>
        <div class="rc-meta">${r.stricter ? `<span>${r.stricter} stricter</span>` : ''}${r.looser ? `<span>${r.looser} looser</span>` : ''}${r.waived ? `<span>${r.waived} waived</span>` : ''}${r.deferred ? `<span>${r.deferred} deferred</span>` : ''}<span class="muted">${r.inherit} as-is</span></div>
      </div>`).join('')}</div>` : `<p class="muted small">No contested rules — the domains and the center agree. Rare and worth celebrating.</p>`}
  </section>`;
}

function promotions(rep: FederationReport): string {
  const list = rep.promotionCandidates;
  return `<section class="panel">
    <h3>Promote to the baseline <span class="muted">(${list.length})</span></h3>
    <p class="small">Local rules a domain proposed, or that two or more domains grew independently — a signal the center is missing a baseline rule. This is the flow of rules travelling <em>back inward</em>.</p>
    ${list.length ? `<div class="stack">${list.map((l) => `
      <div class="row-card">
        <div class="rc-top"><span class="sev sev-${l.adoption.severity || 'info'}">${SEV_ABBR[l.adoption.severity || 'info']}</span><span class="rc-code">${esc(l.adoption.code)}</span>${l.adoption.proposePromotion ? '<span class="rflag okflag">proposed</span>' : ''}${l.alsoIn.length ? `<span class="rflag" title="also in ${esc(l.alsoIn.join(', '))}">in ${l.alsoIn.length + 1} domains</span>` : ''}</div>
        <div class="rc-name">${esc(l.adoption.name || '')}</div>
        <div class="rc-meta"><span>from <b>${esc(l.domainName)}</b></span>${l.adoption.steward ? `<span>steward ${esc(l.adoption.steward)}</span>` : ''}</div>
        ${l.adoption.rationale ? `<div class="rc-why">${esc(l.adoption.rationale)}</div>` : ''}
      </div>`).join('')}</div>` : `<p class="muted small">No promotion candidates. No domain has proposed a local rule, and none has independently reappeared across domains.</p>`}
  </section>`;
}

function domainDrift(rep: FederationReport): string {
  const rows = [...rep.domainRows].sort((a, b) => b.drift - a.drift);
  return `<section class="panel">
    <h3>Domains <span class="muted">(${rows.length})</span></h3>
    <p class="small">Coverage = how much of the baseline the domain has taken a position on. Drift = how much of that position deviates from the center. High drift is not bad — it's where the real governance conversation lives.</p>
    <div class="stack">${rows.map((d) => `
      <div class="row-card">
        <div class="rc-top"><span class="rc-code">${esc(d.domain.name || d.domain.id)}</span>${d.unstewarded ? '<span class="rflag unstew">no steward</span>' : `<span class="rc-stew">${esc(d.domain.steward!)}</span>`}</div>
        <div class="bars">
          <div class="bar"><span class="bar-l">coverage</span><span class="bar-t"><span class="bar-f cov" style="width:${pct(d.coverage)}"></span></span><span class="bar-v">${pct(d.coverage)}</span></div>
          <div class="bar"><span class="bar-l">drift</span><span class="bar-t"><span class="bar-f drift" style="width:${pct(d.drift)}"></span></span><span class="bar-v">${pct(d.drift)}</span></div>
        </div>
        <div class="rc-meta"><span>${d.enforced} enforced</span><span>${d.deviates} deviations</span>${d.locals ? `<span>${d.locals} local</span>` : ''}${d.undocumentedDeviations ? `<span class="warnt">${d.undocumentedDeviations} undocumented</span>` : ''}</div>
      </div>`).join('')}</div>
  </section>`;
}

function attention(rep: FederationReport): string {
  const uns = rep.ruleRows.filter((r) => r.unstewarded);
  const undoc = rep.ruleRows.filter((r) => r.undocumented);
  const orph = rep.ruleRows.filter((r) => r.orphan);
  const grp = (title: string, note: string, items: RuleRow[]) => items.length ? `
    <div class="att-grp"><h4>${title} <span class="muted">(${items.length})</span></h4><p class="att-note">${note}</p>
      <div class="chips">${items.map((r) => `<span class="chip" data-rule="${esc(r.rule.code)}">${esc(r.rule.code)}</span>`).join('')}</div></div>` : '';
  const any = uns.length || undoc.length || orph.length;
  return `<section class="panel">
    <h3>Needs attention</h3>
    <p class="small">The people-and-process gaps a matrix of severities alone won't show you.</p>
    ${any ? `${grp('Unstewarded', 'No named owner centrally. When the rule is questioned, nobody is accountable to answer.', uns)}
    ${grp('Undocumented', 'No rationale and no linked conversation. A rule you can\'t explain won\'t survive contact with a domain.', undoc)}
    ${grp('Orphaned', 'Enforced by no domain. Either promote the story, or retire the rule from the baseline.', orph)}` : `<p class="muted small">Every rule has a steward, a rationale, and at least one domain enforcing it. This is a healthy baseline.</p>`}
  </section>`;
}

// ---------- rule detail ----------
function ruleDetail(rep: FederationReport, code: string) {
  const r = rep.ruleRows.find((x) => x.rule.code === code); if (!r) return;
  const rule = r.rule;
  const domainName = (id: string) => rep.domains.find((d) => d.id === id)?.name || id;
  const positions = r.cells.map((c) => `
    <div class="pos k-${c.kind}">
      <div class="pos-top"><b>${esc(domainName(c.domainId))}</b><span class="pos-kind">${KIND_LABEL[c.kind]}${c.effective ? ` · ${c.effective}` : ''}</span></div>
      ${c.reason ? `<div class="pos-why">${esc(c.reason)}</div>` : c.kind !== 'inherit' && c.kind !== 'unadopted' ? `<div class="pos-why muted">— no reason on record —</div>` : ''}
      ${c.conversation ? `<a class="pos-conv" href="${esc(c.conversation)}" target="_blank" rel="noopener">conversation ↗</a>` : ''}
    </div>`).join('');
  const el = modal(`
    <div class="dm-head"><span class="sev sev-${rule.severity}">${SEV_ABBR[rule.severity]}</span><h2>${esc(rule.code)}</h2></div>
    ${rule.name ? `<p class="dm-name">${esc(rule.name)}</p>` : ''}
    <div class="dm-meta">
      ${rule.steward ? `<span>steward <b>${esc(rule.steward)}</b></span>` : '<span class="warnt">no steward</span>'}
      ${rule.version ? `<span>v${esc(rule.version)}</span>` : ''}
      ${rule.since ? `<span>since ${esc(rule.since)}</span>` : ''}
      <span>${r.positions}/${rep.domains.length} domains weighed in · ${pct(r.divergence)} diverge</span>
    </div>
    ${rule.rationale ? `<p class="dm-why"><b>Why it matters.</b> ${esc(rule.rationale)}</p>` : `<p class="dm-why muted">No rationale on record — the storytelling that makes a rule stick is missing.</p>`}
    ${rule.roadmap ? `<p class="dm-road"><b>Roadmap.</b> ${esc(rule.roadmap)}</p>` : ''}
    <div class="dm-links">
      ${rule.docUrl ? `<a href="${esc(rule.docUrl)}" target="_blank" rel="noopener">rule doc ↗</a>` : ''}
      ${rule.conversation ? `<a href="${esc(rule.conversation)}" target="_blank" rel="noopener">central conversation ↗</a>` : ''}
    </div>
    <h3 class="dm-sub">Domain positions</h3>
    <div class="pos-list">${positions}</div>`);
  el.querySelectorAll<HTMLElement>('[data-rule]').forEach((x) => x.addEventListener('click', () => { el.remove(); ruleDetail(rep, x.dataset.rule!); }));
}

function about() {
  modal(`
    <h2>A federated rule registry</h2>
    <p>A single, central rules registry in Git and NPM is a must-have — but on its own it breaks down. Some team always has a pattern in production it can't change, another team needs the rule stricter, and a third has grown a rule of its own the center never wrote. Governed by decree, the registry starts working <em>against</em> the teams it's meant to serve.</p>
    <p>A <strong>federated</strong> registry keeps a small, accountable <strong>central baseline</strong> and lets each <strong>domain</strong> adopt it by reference — inheriting most rules, <strong>overriding severity</strong> where its products demand it, <strong>waiving</strong> or <strong>deferring</strong> the rest, and growing <strong>local rules</strong> that can flow back to the center for promotion. Every deviation carries a <strong>reason</strong>, a <strong>steward</strong>, and a linked <strong>conversation</strong>.</p>
    <p>This tool takes that model as one JSON/YAML file and shows you the federation: the <strong>contested</strong> rules that need a variation or better storytelling, the <strong>unstewarded</strong> and <strong>undocumented</strong> rules nobody can defend, the <strong>orphaned</strong> rules no domain enforces, and the local rules worth <strong>promoting</strong>. It's modeled on how Germany's federal API authorization program splits a coarse central baseline from fine-grained domain decisions — and writes down the <em>why</em> for every one.</p>
    <p class="muted small">Runs entirely in your browser. Nothing you paste leaves the page.</p>`);
}

// ---------- helpers ----------
function modal(inner: string): HTMLElement {
  document.getElementById('detail-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'detail-modal';
  el.innerHTML = `<div class="about-backdrop"></div><div class="about-card"><button class="detail-close" id="detail-close">&times;</button>${inner}</div>`;
  document.body.appendChild(el);
  el.querySelector('#detail-close')!.addEventListener('click', () => el.remove());
  el.querySelector('.about-backdrop')!.addEventListener('click', () => el.remove());
  return el;
}

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
