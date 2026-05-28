export default function WhoItsFor() {
  return (
    <section className="surface-card section-card who-card">
      <header className="section-header">
        <span className="section-eyebrow">Who it&apos;s for</span>
        <h2 className="section-title">
          <span className="serif">Built for the people who</span>{" "}
          <span className="serif-bold">already speak the language.</span>
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
          <h3 className="who-title serif-bold">Growth-stage leadership teams</h3>
          <p className="who-body">
            Founders, CEOs, COOs, and their leadership teams running on Scaling Up. You
            know what a Rock is. You don&apos;t need a glossary.
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
          <h3 className="who-title serif-bold">Certified Scaling Up coaches</h3>
          <p className="who-body">
            Manage every client engagement from one command center. Health, Rocks, and
            rhythms across the entire book of business.
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
          <h3 className="who-title serif-bold">Companies in quarterly rhythm</h3>
          <p className="who-body">
            10 to 500 people. Quarterly planning is sacred. The OPSP lives on the wall —
            now it lives in QuikScale too.
          </p>
        </article>
      </div>

      <blockquote className="who-quote">
        <p className="serif">
          &ldquo;Finally a tool that doesn&apos;t ask my CEOs to translate their language
          into someone else&apos;s framework. It just <em>is</em> Scaling Up.&rdquo;
        </p>
        <footer className="who-cite">
          <span className="who-cite-avatar pillar-strategy" aria-hidden="true" />
          <span>
            <strong>Certified Scaling Up Coach</strong>
            <span className="who-cite-sub">11 client companies on QuikScale</span>
          </span>
        </footer>
      </blockquote>
    </section>
  );
}
