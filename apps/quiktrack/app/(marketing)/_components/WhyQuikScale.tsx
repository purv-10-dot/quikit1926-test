const reasons = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
    title: "Instant sprint visibility",
    body: "Velocity, burndown, and cycle time — live on one screen. Know exactly where your sprint stands before standup, not after the deadline slips.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18M9 3v18" />
      </svg>
    ),
    title: "One workspace, every team",
    body: "Engineering, product, and leadership aligned on the same source of truth. No context-switching, no stale status updates, no 'what sprint is this?' in Slack.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    title: "Up and running in days",
    body: "Intuitive by design — your team is running their first sprint in under a week. No lengthy onboarding, no certification courses, no dedicated admin required.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 4.5v6c0 4.5-4 7.5-9 10.5-5-3-9-6-9-10.5v-6L12 3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Everything in one plan",
    body: "Sprint boards, backlog, custom workflows, velocity reports, and release tracking — all included. No add-ons, no paywalled features, no surprise upgrade prompts.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    ),
    title: "Connected Quikit OS",
    body: "A deal closes in QuikCRM, a project opens in QuikTrack. Engineering KPIs flow into QuikScale — one seamlessly connected suite for your entire company.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="15" r="3" />
        <path d="M11 11l4 2" />
      </svg>
    ),
    title: "Workflows built your way",
    body: "Custom statuses, transitions, validators, and approvals. Build the exact process your team runs — not the rigid default someone else decided you'd need.",
  },
] as const;

export default function WhyQuikScale() {
  return (
    <section id="why" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">Why teams choose QuikTrack</span>
        <h2 className="section-title">
          <span className="serif">Why fast-moving engineering teams</span>{" "}
          <span className="serif-bold">choose QuikTrack.</span>
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
