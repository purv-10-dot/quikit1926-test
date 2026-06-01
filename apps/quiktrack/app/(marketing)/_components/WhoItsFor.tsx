export default function WhoItsFor() {
  return (
    <section className="surface-card section-card who-card">
      <header className="section-header">
        <span className="section-eyebrow">Who it&apos;s for</span>
        <h2 className="section-title">
          <span className="serif">Built for the teams</span>{" "}
          <span className="serif-bold">who move fast and ship often.</span>
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
            Lead 10–200 engineers with full sprint visibility, real-time issue tracking,
            and velocity reports that show you where to focus — before a deadline slips
            and becomes a post-mortem.
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
          <h3 className="who-title serif-bold">Founders &amp; Product teams</h3>
          <p className="who-body">
            Stay close to every feature, bug, and release without drowning in status
            meetings. One workspace connects product goals directly to engineering
            execution — from BHAG to shipped build.
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
            Start right from day one with a tool that scales with your team.
            Full-featured sprint boards, backlogs, and custom workflows — built for
            5 engineers today and ready for 200 tomorrow.
          </p>
        </article>
      </div>

    </section>
  );
}
