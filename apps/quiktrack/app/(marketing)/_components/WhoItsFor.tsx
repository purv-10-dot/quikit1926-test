export default function WhoItsFor() {
  return (
    <section className="surface-card section-card who-card">
      <header className="section-header">
        <span className="section-eyebrow">Who it&apos;s for</span>
        <h2 className="section-title">
          <span className="serif">Built for the teams</span>{" "}
          <span className="serif-bold">paying too much for Jira.</span>
        </h2>
      </header>

      <div className="who-grid">
        <article className="who-tile">
          <span className="who-icon-outline" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <circle cx="17" cy="9.5" r="2.4" />
              <path d="M14.5 19.5c0-2.6 1.9-4.5 4.5-4.5s2.5.4 3 1.2" />
            </svg>
          </span>
          <h3 className="who-title serif-bold">Engineering managers &amp; CTOs</h3>
          <p className="who-body">
            10–200 engineers, currently on Jira, watching the per-seat USD bill climb
            with every hire. Same sprints, same backlog, same workflows — your team
            won&apos;t notice the switch, except in finance.
          </p>
        </article>
        <article className="who-tile">
          <span className="who-icon-outline" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="9" r="5" />
              <path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5" />
              <path d="M12 6.5v2.6l1.8 1" />
            </svg>
          </span>
          <h3 className="who-title serif-bold">Founders &amp; CFOs</h3>
          <p className="who-body">
            Atlassian is in your top 5 SaaS line items, and renewal quotes jump 10–15% a
            year. QuikTrack is INR-priced with no exchange-rate risk — roughly ₹3.5L/year
            cheaper for a 50-person team.
          </p>
        </article>
        <article className="who-tile">
          <span className="who-icon-outline" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15" rx="2" />
              <path d="M3.5 10h17" />
              <path d="M8 3v4M16 3v4" />
              <path d="M7.5 14h2M11.5 14h2M15.5 14h2M7.5 17h2M11.5 17h2" />
            </svg>
          </span>
          <h3 className="who-title serif-bold">Early-stage Indian startups</h3>
          <p className="who-body">
            0–20 engineers. You know Jira is the standard but can&apos;t justify the price
            on day one. Start on QuikTrack and grow with it — no migration ever required.
          </p>
        </article>
      </div>

    </section>
  );
}
