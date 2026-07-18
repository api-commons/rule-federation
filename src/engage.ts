// Weave API Evangelist governance services into the app. Every action routes to
// info@apievangelist.com over a mailto link, with the current context pre-filled
// — so engagement works even in a forked or fully local copy, with no backend.
// Rule Federation is free, open tooling; API Evangelist sells the expert services
// around it — and standing up a federated rule registry is exactly the kind of
// people-plus-process work those services exist for.
const EMAIL = 'info@apievangelist.com';
const APP = 'Rule Federation';
const SERVICES_URL = 'https://apievangelist.com/services/';

interface Service {
  title: string;
  blurb: string;
  cta: string;
  subject: string;
  url: string;
  body: (ctx: string) => string;
}

// People arrive here to run a central-plus-federated rule registry across many
// teams — so rules, standards, reviews, and pipelines lead.
const SERVICES: Service[] = [
  {
    title: 'Rules',
    blurb: 'Author the central baseline ruleset teams adopt by reference — with severity, guidance, and a steward per rule — and the per-domain overrides that keep it honest.',
    cta: 'Author my baseline',
    url: `${SERVICES_URL}governance/rules/`,
    subject: 'Federated ruleset engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe want a central baseline Spectral ruleset our domains can adopt by reference, with a sane way to federate overrides.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Standards',
    blurb: 'Identify and develop the standards behind the rules — and the stewardship model, versioning, and roadmap that let a federation of teams evolve them together.',
    cta: 'Develop standards',
    url: `${SERVICES_URL}discovery/standards/`,
    subject: 'API standards & federation engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe'd like help developing the standards and the stewardship/communication model behind a federated rule registry.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Reviews',
    blurb: 'Review the federation itself — the contested rules, the undocumented deviations, the orphaned rules, and the local rules that ought to be promoted to the center.',
    cta: 'Review my federation',
    url: `${SERVICES_URL}governance/reviews/`,
    subject: 'Rule federation review request',
    body: (ctx) => `Hi API Evangelist,\n\nWe'd like a review of how our central and domain rulesets are federating — divergence, drift, and the promotion backlog.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Pipelines',
    blurb: 'Wire the central baseline and each domain’s overrides into CI/CD, so the right effective ruleset runs on every change — centrally and out in the domains.',
    cta: 'Automate the flow',
    url: `${SERVICES_URL}governance/pipelines/`,
    subject: 'Federated governance pipelines engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe'd like to wire our central-plus-federated rulesets into CI/CD, with the flow of rules via commits and PRs both ways.\n\n${ctx}\n\nThanks,`,
  },
];

function mailto(s: Service, ctx: string): string {
  const body = `${s.body(ctx)}\n\n— sent from ${APP} (federation.apicommons.org)`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(body)}`;
}

export function initEngage(context: () => string): void {
  const btn = document.getElementById('engage-ae');
  if (!btn) return;

  const modal = document.createElement('div');
  modal.className = 'modal engage-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card engage-card">
      <div class="modal-head">
        <span id="modal-title">Work with API Evangelist</span>
        <button type="button" class="engage-close" aria-label="Close">×</button>
      </div>
      <div class="engage-body">
        <p class="engage-intro">Rule Federation is open and free to use yourself. When you want experts in the loop,
          <a href="https://apievangelist.com" target="_blank" rel="noopener">API Evangelist</a> offers governance
          services — every option below opens an email to
          <a id="engage-email" href="mailto:${EMAIL}">${EMAIL}</a> with your current context filled in.</p>
        <div class="engage-services"></div>
        <p class="engage-foot"><a href="${SERVICES_URL}" target="_blank" rel="noopener">See all governance services →</a></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('.engage-services') as HTMLElement;
  const emailEl = modal.querySelector('#engage-email') as HTMLAnchorElement;
  const close = () => { modal.hidden = true; };

  function render(): void {
    const ctx = context();
    listEl.innerHTML = SERVICES.map((s, i) => `
      <div class="engage-service">
        <div class="engage-service-text"><strong>${s.title}</strong><span>${s.blurb}</span>
          <a class="engage-details" href="${s.url}" target="_blank" rel="noopener">details ↗</a></div>
        <a class="engage-cta" href="${mailto(s, ctx)}" data-i="${i}">${s.cta}</a>
      </div>`).join('');
    emailEl.href = mailto(SERVICES[0], ctx);
  }

  btn.addEventListener('click', () => { render(); modal.hidden = false; });
  modal.querySelector('.engage-close')!.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
