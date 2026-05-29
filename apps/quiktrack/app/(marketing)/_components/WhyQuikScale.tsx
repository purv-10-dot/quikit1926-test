const reasons = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
    title: "90% lower cost than Jira",
    body: "₹660/user vs ₹66. Same sprint boards, same backlog, same workflows. Same features — a very different invoice.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18M9 3v18" />
      </svg>
    ),
    title: "No currency surprises",
    body: "Jira, Linear, and ClickUp bill in USD — so your SaaS budget moves with the dollar-rupee rate. QuikTrack bills in INR, always.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    title: "Live in under a week",
    body: "Import your Jira projects, boards, and issue history. Your workflow doesn't change — your team is running their first sprint on QuikTrack within days.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 4.5v6c0 4.5-4 7.5-9 10.5-5-3-9-6-9-10.5v-6L12 3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Everything included",
    body: "Velocity reports, custom workflows, release tracking — all in the base plan. No Confluence, no Tempo, no marketplace add-ons to reach feature parity.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    ),
    title: "Connected Quikit OS",
    body: "A deal closes in QuikCRM, a project opens in QuikTrack. Engineering KPIs flow into QuikScale — one suite, priced for India.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="15" r="3" />
        <path d="M11 11l4 2" />
      </svg>
    ),
    title: "Nobody notices the switch",
    body: "Same Scrum and Kanban boards your engineers learned on Jira. The team keeps its workflow; only finance sees the difference.",
  },
] as const;

export default function WhyQuikScale() {
  return (
    <section id="why" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">Why teams switch</span>
        <h2 className="section-title">
          <span className="serif">Why Indian engineering teams</span>{" "}
          <span className="serif-bold">switch to QuikTrack.</span>
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
