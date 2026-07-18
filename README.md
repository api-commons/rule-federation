# Rule Federation

**A federated API governance rule registry.**
[federation.apicommons.org](https://federation.apicommons.org)

A single, central rules registry in Git and NPM is a must-have for any enterprise —
but on its own it breaks down. Some team always has a pattern in production it can't
change; another needs a rule stricter; a third has grown a rule of its own the center
never wrote. Governed by decree, a central registry starts working *against* the teams
it is meant to serve.

**Rule Federation models the alternative:** a small, accountable **central baseline**
plus the **domains that adopt it**. Each domain adopts the baseline by reference —
inheriting most rules, **overriding severity** where its products demand it, **waiving**
or **deferring** the rest, and growing **local rules** that can flow back to the center
for promotion. Every deviation carries a **reason**, a **steward**, and a linked
**conversation**.

Give the tool that model as one JSON/YAML file and it shows you the federation as a
matrix, then surfaces the signals a bare list of severities never will.

## What it computes

- **The federation matrix** — every central rule × every domain, each cell showing that
  domain's position: inherit, override ↑ (stricter), override ↓ (looser), waived,
  deferred, or not adopted. Click any rule for its rationale, roadmap, central
  conversation, and every domain's reason.
- **Contested rules** — where a third or more of the domains that weighed in deviate
  from the center. A contested rule needs a decision: a sanctioned *variation*, a change
  to the baseline, or better storytelling about why the pattern matters.
- **Promote to the baseline** — local rules a domain proposed, or that two or more
  domains grew independently — the flow of rules travelling *back inward*.
- **Domain drift** — coverage (how much of the baseline the domain has a position on)
  and drift (how much of that position deviates), plus undocumented deviations.
- **Needs attention** — **unstewarded** rules (no accountable owner), **undocumented**
  rules (no rationale and no linked conversation), and **orphaned** rules (enforced by no
  domain).

## The model — `federation.json`

The whole federation is one file, served as open data at
[`/federation.json`](https://federation.apicommons.org/federation.json) and validated by
[`/federation.schema.json`](https://federation.apicommons.org/federation.schema.json).

```jsonc
{
  "central": {
    "name": "Acme API Baseline",
    "owner": "API Platform Team",
    "rules": [
      {
        "code": "oauth-scopes-defined",
        "name": "Every secured operation declares OAuth scopes",
        "severity": "error",          // the baseline the center holds
        "steward": "identity-guild",  // who owns the rule centrally
        "rationale": "Scopes are the coarse, auditable handle on what a token may do…",
        "conversation": "https://github.com/acme/api-standards/issues/31",
        "version": "3.0.0"
      }
    ]
  },
  "domains": [
    {
      "id": "citizen", "name": "Citizen-Facing", "steward": "team-public",
      "adoptVia": "extends: ['https://rules.acme.dev/baseline#recommended', './citizen.rules.yaml']",
      "adoptions": [
        { "code": "oauth-scopes-defined", "state": "override", "severity": "warn",
          "reason": "Many public read endpoints are intentionally unauthenticated open data.",
          "conversation": "https://github.com/acme/citizen-ruleset/issues/6" },
        { "code": "oauth-scope-naming", "state": "local", "severity": "warn",
          "name": "Scopes follow a resource:action convention",
          "rationale": "Self-describing, greppable, consistent across domains.",
          "proposePromotion": true }
      ]
    }
  ]
}
```

Each **adoption** has a `state`:

| state | meaning |
| --- | --- |
| `inherit` | Take the central rule and its severity as-is. |
| `override` | Enforce it at the domain's own `severity` (stricter or looser). Give a `reason`. |
| `waived` | Do not enforce it here. Give a `reason` — a waiver with no reason is flagged. |
| `deferred` | Not yet — planned to adopt. Give a `reason`. |
| `local` | A rule the domain owns that isn't in the baseline. Set `proposePromotion: true` to nominate it. |

## Why this shape

It is modeled on how Germany's **Föderale API-Autorisierungsinfrastruktur** splits a
*coarse, central* baseline from *fine-grained, domain-owned* decisions — and writes down
the *why* for every one, as decision records with a linked conversation. The lesson that
program teaches is that API governance is much more than the rules: it is the people,
the stewardship, the versioning, and the storytelling. This tool tries to make that
visible.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run build      # emits dist/ (what Pages publishes)
```

The site is a small Vite + TypeScript app with no backend. `src/federation.ts` is the
model and the math; `src/main.ts` renders the matrix and the panels; the whole federation
is the single `public/federation.json` file. Contribute rules or fixes by pull request.

## An API Commons tool

Rule Federation is free, open tooling maintained under
[API Commons](https://apicommons.org), a project of
[API Evangelist](https://apievangelist.com). It sits alongside
[Ruleset Commons](https://rulesets.apicommons.org),
[Governance Waivers](https://waivers.apicommons.org),
[API Governance Graph](https://graph.apicommons.org), and the rest of the family. The
open tools exist to make good governance the easy path; API Evangelist offers expert
[governance services](https://apievangelist.com/services/) — authoring the baseline,
developing the standards and stewardship model behind it, reviewing the federation, and
wiring it into pipelines — when you want hands on the work.

Licensed under [Apache-2.0](LICENSE).
