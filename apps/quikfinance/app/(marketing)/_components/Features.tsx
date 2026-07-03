export default function Features() {
  return (
    <section id="features" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The Product</span>
        <h2 className="section-title">
          <span className="serif">Everything your team needs</span>{" "}
          <span className="serif-bold">to set goals and hit them.</span>
        </h2>
        <p className="section-lede">
          From quarterly priorities to weekly check-ins — connected across every team,
          backed by real data.
        </p>
      </header>

      <div className="features-grid">
        {/* OPSP Builder */}
        <article className="feature-card">
          <div className="feature-copy">
            <span className="feature-tag tag-strategy">Strategy</span>
            <h3 className="feature-title serif-bold">One-Page Strategic Plan</h3>
            <p className="feature-body">
              The flagship Scaling Up artifact, digitized and live. BHAG, core values,
              annual priorities, quarterly Rocks, and Critical Numbers — captured on a
              single page the whole company can see.
            </p>
          </div>
          <div className="feature-visual opsp-visual">
            <div className="opsp-row">
              <div className="opsp-cell">
                <span className="opsp-label">BHAG</span>
                <span className="opsp-value">$250M ARR by 2032</span>
              </div>
              <div className="opsp-cell">
                <span className="opsp-label">Core Values</span>
                <span className="opsp-value">Own it · Move fast · No surprises</span>
              </div>
            </div>
            <div className="opsp-row">
              <div className="opsp-cell">
                <span className="opsp-label">Annual Priority</span>
                <span className="opsp-value">Launch in EMEA</span>
              </div>
              <div className="opsp-cell">
                <span className="opsp-label">Critical #</span>
                <span className="opsp-value">NRR &gt; 118%</span>
              </div>
            </div>
            <div className="opsp-row">
              <div className="opsp-cell opsp-cell-wide">
                <span className="opsp-label">Q3 Rocks</span>
                <span className="opsp-value">5 owned · 3 on track · 1 at risk</span>
              </div>
            </div>
          </div>
        </article>

        {/* KPI Scorecard */}
        <article className="feature-card">
          <span className="feature-tag tag-execution">Execution</span>
          <h3 className="feature-title serif-bold">Critical Number tracking</h3>
          <p className="feature-body">
            Every owner reports their one number. The cockpit flags red, yellow, and green
            — the whole company&apos;s health at a glance.
          </p>
          <div className="feature-visual scorecard-visual">
            <div className="kpi-row">
              <span className="kpi-label">MRR growth</span>
              <span className="kpi-value">+12.4%</span>
              <span className="kpi-flag flag-green" />
            </div>
            <div className="kpi-row">
              <span className="kpi-label">CAC payback</span>
              <span className="kpi-value">14.2 mo</span>
              <span className="kpi-flag flag-yellow" />
            </div>
            <div className="kpi-row">
              <span className="kpi-label">Pipeline coverage</span>
              <span className="kpi-value">2.1x</span>
              <span className="kpi-flag flag-red" />
            </div>
            <div className="kpi-row">
              <span className="kpi-label">eNPS</span>
              <span className="kpi-value">62</span>
              <span className="kpi-flag flag-green" />
            </div>
          </div>
        </article>

        {/* Quarterly Rocks */}
        <article className="feature-card">
          <span className="feature-tag tag-cash">Priorities</span>
          <h3 className="feature-title serif-bold">Quarterly Rocks</h3>
          <p className="feature-body">
            3–5 priorities, each with an owner, due date, and progress. The things that
            absolutely must get done this quarter — tracked against the 90-day cadence.
          </p>
          <div className="feature-visual rocks-visual">
            <div className="rock-row">
              <span className="rock-owner" data-initials="MK" />
              <span className="rock-name">Ship EMEA billing</span>
              <span className="rock-bar"><span style={{ width: "82%" }} /></span>
              <span className="rock-pct">82%</span>
            </div>
            <div className="rock-row">
              <span className="rock-owner" data-initials="JT" />
              <span className="rock-name">Hire 4 AEs</span>
              <span className="rock-bar"><span style={{ width: "50%" }} /></span>
              <span className="rock-pct">50%</span>
            </div>
            <div className="rock-row">
              <span className="rock-owner" data-initials="AP" />
              <span className="rock-name">Onboarding v2</span>
              <span className="rock-bar"><span style={{ width: "95%" }} /></span>
              <span className="rock-pct">95%</span>
            </div>
          </div>
        </article>

        {/* Meeting rhythm */}
        <article className="feature-card">
          <span className="feature-tag tag-people">People</span>
          <h3 className="feature-title serif-bold">Meeting Rhythm engine</h3>
          <p className="feature-body">
            Daily huddles. Weekly teams. Monthly leadership. Quarterly planning. The
            cadence runs inside the tool — agendas, owners, and follow-ups linked to
            Rocks and KPIs.
          </p>
          <div className="feature-visual rhythm-visual">
            <div className="rhythm-row"><span className="rhythm-dot dot-people" /><span>Daily huddle · 09:00</span><span className="rhythm-sub">15 min</span></div>
            <div className="rhythm-row"><span className="rhythm-dot dot-execution" /><span>Weekly L10 · Mon</span><span className="rhythm-sub">60 min</span></div>
            <div className="rhythm-row"><span className="rhythm-dot dot-strategy" /><span>Monthly leadership</span><span className="rhythm-sub">2 hr</span></div>
            <div className="rhythm-row"><span className="rhythm-dot dot-cash" /><span>Quarterly planning</span><span className="rhythm-sub">1 day</span></div>
          </div>
        </article>

        {/* Goal cascade */}
        <article className="feature-card">
          <span className="feature-tag tag-strategy">Strategy</span>
          <h3 className="feature-title serif-bold">Top-down goal cascade</h3>
          <p className="feature-body">
            Company → department → individual. Every employee sees how their work
            connects to the BHAG. Alignment isn&apos;t a memo — it&apos;s a tree.
          </p>
          <div className="feature-visual cascade-visual">
            <div className="cascade-node node-top">$250M ARR · BHAG</div>
            <div className="cascade-row">
              <div className="cascade-node">EMEA launch</div>
              <div className="cascade-node">NRR &gt; 118%</div>
              <div className="cascade-node">90 NPS</div>
            </div>
            <div className="cascade-row cascade-row-leaf">
              <div className="cascade-node leaf">Sales · MK</div>
              <div className="cascade-node leaf">Success · AP</div>
              <div className="cascade-node leaf">Product · JT</div>
              <div className="cascade-node leaf">CX · RD</div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
