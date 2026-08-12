interface Feature {
  title: string;
  body: string;
  /** Inline SVG path data — avoids pulling an icon dependency into a static page. */
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Leads that don't go cold",
    body: "Capture from forms, imports or the web widget, score them, and route each one to an owner automatically. SLA rules escalate anything left sitting.",
    icon: (
      <path d="M3 5h18M3 12h12M3 19h7" strokeLinecap="round" strokeWidth="2" />
    ),
  },
  {
    title: "Pipeline you can trust",
    body: "Accounts, contacts and opportunities with enforced stage transitions — closed states are terminal, so the forecast reflects reality rather than optimism.",
    icon: (
      <path
        d="M4 19V9m6 10V5m6 14v-7"
        strokeLinecap="round"
        strokeWidth="2"
      />
    ),
  },
  {
    title: "Telephony, built in",
    body: "Dial from the lead record. Connected, busy or callback — the outcome posts back against the lead and disposition rules take the next action.",
    icon: (
      <path
        d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    ),
  },
  {
    title: "Quotes to orders",
    body: "Build from a price list, send a secure portal link, let the customer accept or e-sign. An accepted quote becomes an order without re-entry.",
    icon: (
      <path
        d="M7 3h7l5 5v13H7zM14 3v5h5"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    ),
  },
  {
    title: "Automation that follows up",
    body: "A workflow engine triggers on lead events — created, stage changed, call disposed — to assign owners, raise tasks and send mail on your rules.",
    icon: (
      <path
        d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5l-2.8 2.8M9.3 14.7l-2.8 2.8m0-11.3l2.8 2.8m5.4 5.4l2.8 2.8"
        strokeLinecap="round"
        strokeWidth="2"
      />
    ),
  },
  {
    title: "Access you control centrally",
    body: "A QuikIT super admin enables the app for an organisation and assigns it to users; roles and permissions decide what each person can reach inside.",
    icon: (
      <path
        d="M12 3l8 4v5c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V7z"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    ),
  },
];

export default function Features() {
  return (
    <section className="section section-alt" id="features">
      <div className="wrap">
        <div className="section-header" data-reveal>
          <span className="eyebrow">What it does</span>
          <h2>The whole sales motion, without the tab-switching.</h2>
          <p>
            Six things a sales team actually does every day — in one app, on one
            login, sharing one org directory with the rest of the Quikit suite.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article className="feature-card" key={f.title} data-reveal>
              <span className="feature-icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  {f.icon}
                </svg>
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
