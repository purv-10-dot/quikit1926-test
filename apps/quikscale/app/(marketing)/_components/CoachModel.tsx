export default function CoachModel() {
  return (
    <section id="coaches" className="surface-card section-card coach-card">
      <div className="coach-grid">
        <div className="coach-copy">
          <span className="section-eyebrow on-dark">For Scaling Up coaches</span>
          <h2 className="section-title on-dark">
            <span className="serif">One command center.</span>{" "}
            <span className="serif-bold">Every client company.</span>
          </h2>
          <p className="section-lede on-dark">
            QuikScale gives certified coaches a single dashboard across every engagement
            — health, Rocks, and rhythms at a glance. Walk into any client meeting
            already knowing what&apos;s red.
          </p>
          <ul className="coach-list">
            <li>Multi-company health view, pillar-by-pillar</li>
            <li>Quarter-over-quarter Rock completion across the book</li>
            <li>Co-branded portal — your practice, your clients</li>
            <li>Partner revenue share on every seat</li>
          </ul>
          <a href="#partner" className="btn btn-light btn-lg">
            Apply for the coach program
            <svg className="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <div className="coach-visual">
          <div className="coach-header">
            <span className="coach-title">Client portfolio · Q3</span>
            <span className="coach-count">11 companies</span>
          </div>
          <div className="coach-clients">
            <div className="client-row">
              <span className="client-name">Northwind Logistics</span>
              <span className="client-pills">
                <span className="client-pill p-people">P</span>
                <span className="client-pill p-strategy">S</span>
                <span className="client-pill p-execution warn">E</span>
                <span className="client-pill p-cash">C</span>
              </span>
              <span className="client-meta">4 / 5 Rocks</span>
            </div>
            <div className="client-row">
              <span className="client-name">Helix Bio</span>
              <span className="client-pills">
                <span className="client-pill p-people">P</span>
                <span className="client-pill p-strategy">S</span>
                <span className="client-pill p-execution">E</span>
                <span className="client-pill p-cash">C</span>
              </span>
              <span className="client-meta">5 / 5 Rocks</span>
            </div>
            <div className="client-row">
              <span className="client-name">Atlas Manufacturing</span>
              <span className="client-pills">
                <span className="client-pill p-people warn">P</span>
                <span className="client-pill p-strategy">S</span>
                <span className="client-pill p-execution">E</span>
                <span className="client-pill p-cash danger">C</span>
              </span>
              <span className="client-meta">2 / 4 Rocks</span>
            </div>
            <div className="client-row">
              <span className="client-name">Brightline Studios</span>
              <span className="client-pills">
                <span className="client-pill p-people">P</span>
                <span className="client-pill p-strategy">S</span>
                <span className="client-pill p-execution">E</span>
                <span className="client-pill p-cash">C</span>
              </span>
              <span className="client-meta">3 / 3 Rocks</span>
            </div>
            <div className="client-row">
              <span className="client-name">Kettle &amp; Co.</span>
              <span className="client-pills">
                <span className="client-pill p-people">P</span>
                <span className="client-pill p-strategy warn">S</span>
                <span className="client-pill p-execution">E</span>
                <span className="client-pill p-cash">C</span>
              </span>
              <span className="client-meta">3 / 5 Rocks</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
