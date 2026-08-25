const FEATURES = [
  {
    icon: "⚡",
    title: "Triggers from any app",
    body: "A Fathom meeting ends, a KPI slips red, a form is submitted — start a workflow the moment it happens, across any connected QuikIT app.",
  },
  {
    icon: "🔀",
    title: "Conditional branching",
    body: "Route on org, role, or field values with no-code condition blocks. The same workflow adapts per team without duplicating it.",
  },
  {
    icon: "🔗",
    title: "Cross-app actions",
    body: "Create a KPI entry, post a QuikChat message, schedule a Teams meeting, or send an email — one canvas orchestrates them all in order.",
  },
  {
    icon: "🕒",
    title: "Schedules & approvals",
    body: "Run on a cron schedule or pause for a human approval step. Every run is logged — step by step — for audit and debugging.",
  },
];

export default function Features() {
  return (
    <section id="features" className="section-card">
      <header className="section-header">
        <span className="section-eyebrow">The Product</span>
        <h2 className="section-title">Built to connect QuikIT — not replace it</h2>
        <p className="section-lede">
          Four building blocks. One automation canvas. Real workflow runs —
          not empty templates.
        </p>
      </header>

      <div className="features-grid">
        {FEATURES.map((f) => (
          <article className="feature-card" key={f.title}>
            <div className="feature-icon" aria-hidden="true">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-body">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
