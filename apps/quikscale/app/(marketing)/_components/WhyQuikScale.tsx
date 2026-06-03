const reasons = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
    title: "Built for the way you already work",
    body: "Daily standups, weekly L10s, monthly leadership, quarterly planning — QuikScale plugs into your cadence. No new rituals to learn.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18M9 3v18" />
      </svg>
    ),
    title: "One screen for the whole business",
    body: "People, Strategy, Execution, and Cash on one dashboard. No more switching between Asana, Lattice, and a finance spreadsheet to know what's red.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    title: "Live in days, not quarters",
    body: "Import your OPSP and last quarter's Rocks in under an hour. Most teams are running their first weekly meeting on QuikScale in the first week.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 4.5v6c0 4.5-4 7.5-9 10.5-5-3-9-6-9-10.5v-6L12 3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Your data, your control",
    body: "Encrypted at rest and in transit. SSO, audit logs, role-based permissions — built for the leadership team's most sensitive numbers.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    ),
    title: "Priced for growth-stage budgets",
    body: "Transparent per-seat pricing. No enterprise minimums, no implementation fees, no surprise add-ons for the modules you actually need.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="15" r="3" />
        <path d="M11 11l4 2" />
      </svg>
    ),
    title: "Coach-friendly, not coach-required",
    body: "Run it yourself or invite your Scaling Up coach to a co-pilot seat. Your engagement, your call — either way, the tool stays the same.",
  },
] as const;

export default function WhyQuikScale() {
  return (
    <section id="why" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">Why QuikScale</span>
        <h2 className="section-title">
          <span className="serif">Six reasons leadership teams</span>{" "}
          <span className="serif-bold">switch — and stay.</span>
        </h2>
      </header>

      <div className="why-grid">
        {reasons.map((r) => (
          <article key={r.title} className="why-card">
            <span className="why-icon" aria-hidden="true">{r.icon}</span>
            <h3 className="why-title serif-bold">{r.title}</h3>
            <p className="why-body">{r.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
