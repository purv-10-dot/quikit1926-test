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
            — KPI health, Rock status, and meeting rhythms at a glance. Walk into any
            client meeting already knowing what&apos;s red, what&apos;s slipping, and
            what to address. Your clients stay on the methodology between sessions. Your
            practice scales without adding overhead.
          </p>
          <ul className="coach-list">
            <li>Multi-company health view, pillar-by-pillar</li>
            <li>Quarter-over-quarter Rock completion across the book</li>
            <li>AI-generated pre-session briefs for every client meeting</li>
            <li>Co-branded portal — your practice, your clients</li>
            <li>Partner revenue share on every seat</li>
          </ul>
        </div>

        <div className="coach-visual">

          {/* ── Header ── */}
          <div className="cv-header">
            <div className="cv-header-left">
              <span className="cv-title">Coach Dashboard</span>
              <span className="cv-period">Q3 · 2025</span>
            </div>
            <span className="cv-live"><span className="cv-live-dot" />Live</span>
          </div>

          {/* ── Stats ── */}
          <div className="cv-stats">
            <div className="cv-stat">
              <span className="cv-stat-n">11</span>
              <span className="cv-stat-l">Companies</span>
            </div>
            <div className="cv-stat">
              <span className="cv-stat-n">78%</span>
              <span className="cv-stat-l">Rocks on track</span>
            </div>
            <div className="cv-stat cv-stat-attn">
              <span className="cv-stat-n">2</span>
              <span className="cv-stat-l">Need attention</span>
            </div>
          </div>

          {/* ── Column headers ── */}
          <div className="cv-row cv-row-head">
            <span />
            <span className="cv-col-l">People</span>
            <span className="cv-col-l">Strategy</span>
            <span className="cv-col-l">Execution</span>
            <span className="cv-col-l">Cash</span>
            <span className="cv-col-l">Rocks</span>
          </div>

          {/* ── Rows ── */}
          <div className="cv-rows">

            <div className="cv-row">
              <span className="cv-name">Northwind Logistics</span>
              <span className="cv-dot" style={{background:'var(--people)'}} />
              <span className="cv-dot" style={{background:'var(--strategy)'}} />
              <span className="cv-dot cv-warn" style={{background:'var(--execution)'}} />
              <span className="cv-dot" style={{background:'var(--cash)'}} />
              <div className="cv-rocks">
                <div className="cv-bar"><div className="cv-fill" style={{width:'80%'}} /></div>
                <span className="cv-frac">4/5</span>
              </div>
            </div>

            <div className="cv-row">
              <span className="cv-name">Helix Bio</span>
              <span className="cv-dot" style={{background:'var(--people)'}} />
              <span className="cv-dot" style={{background:'var(--strategy)'}} />
              <span className="cv-dot" style={{background:'var(--execution)'}} />
              <span className="cv-dot" style={{background:'var(--cash)'}} />
              <div className="cv-rocks">
                <div className="cv-bar"><div className="cv-fill cv-fill-full" style={{width:'100%'}} /></div>
                <span className="cv-frac">5/5</span>
              </div>
            </div>

            <div className="cv-row cv-row-alert">
              <span className="cv-name">Atlas Manufacturing</span>
              <span className="cv-dot cv-warn" style={{background:'var(--people)'}} />
              <span className="cv-dot" style={{background:'var(--strategy)'}} />
              <span className="cv-dot" style={{background:'var(--execution)'}} />
              <span className="cv-dot cv-danger" style={{background:'rgba(232,80,61,0.25)'}} />
              <div className="cv-rocks">
                <div className="cv-bar"><div className="cv-fill cv-fill-low" style={{width:'50%'}} /></div>
                <span className="cv-frac cv-frac-low">2/4</span>
              </div>
            </div>

            <div className="cv-row">
              <span className="cv-name">Brightline Studios</span>
              <span className="cv-dot" style={{background:'var(--people)'}} />
              <span className="cv-dot" style={{background:'var(--strategy)'}} />
              <span className="cv-dot" style={{background:'var(--execution)'}} />
              <span className="cv-dot" style={{background:'var(--cash)'}} />
              <div className="cv-rocks">
                <div className="cv-bar"><div className="cv-fill cv-fill-full" style={{width:'100%'}} /></div>
                <span className="cv-frac">3/3</span>
              </div>
            </div>

            <div className="cv-row">
              <span className="cv-name">Kettle &amp; Co.</span>
              <span className="cv-dot" style={{background:'var(--people)'}} />
              <span className="cv-dot cv-warn" style={{background:'var(--strategy)'}} />
              <span className="cv-dot" style={{background:'var(--execution)'}} />
              <span className="cv-dot" style={{background:'var(--cash)'}} />
              <div className="cv-rocks">
                <div className="cv-bar"><div className="cv-fill cv-fill-mid" style={{width:'60%'}} /></div>
                <span className="cv-frac">3/5</span>
              </div>
            </div>

          </div>

          {/* ── AI Brief ── */}
          <div className="cv-brief">
            <div className="cv-brief-top">
              <span className="cv-brief-spark">✦</span>
              <span className="cv-brief-label">AI Pre-Session Brief · Atlas Manufacturing</span>
            </div>
            <p className="cv-brief-q">"What's creating the cash constraint heading into Q4?"</p>
            <div className="cv-brief-tags">
              <span className="cv-tag cv-tag-warn">Cash pillar ↓</span>
              <span className="cv-tag">2 / 4 Rocks</span>
              <span className="cv-tag">Session in 2 days</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
