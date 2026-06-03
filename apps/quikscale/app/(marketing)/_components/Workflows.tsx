export default function Workflows() {
  return (
    <section id="workflows" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">Built for the work</span>
        <h2 className="section-title">
          <span className="serif">What a week on</span>{" "}
          <span className="serif-bold">QuikScale looks like.</span>
        </h2>
        <p className="section-lede">
          From quarterly off-site to Monday standup — five workflows that turn your
          leadership cadence into one connected system.
        </p>
      </header>

      <div className="workflows-grid">
        {/* Row 1 — 2 wide cards */}
        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Build the plan</h3>
            <p className="workflow-body">
              Draft your one-page strategic plan in minutes. BHAG, core values, annual
              priorities, and quarterly Rocks — all on one canvas.
            </p>
          </div>
          <div className="workflow-visual wf-opsp">
            <div className="wf-tabs">
              <span className="wf-tab active">Plan</span>
              <span className="wf-tab">Rocks</span>
              <span className="wf-tab">KPIs</span>
              <span className="wf-tab">Values</span>
            </div>
            <div className="wf-opsp-grid">
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">BHAG</span>
                <span className="wf-opsp-value">$250M ARR · 2032</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Annual priority</span>
                <span className="wf-opsp-value">Launch in EMEA</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Critical #</span>
                <span className="wf-opsp-value">NRR &gt; 118%</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Q3 Rocks</span>
                <span className="wf-opsp-value">5 owned</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Assign ownership</h3>
            <p className="workflow-body">
              Every priority, KPI, and Rock has one named owner. Delegate with clarity
              and keep accountability visible at every level.
            </p>
          </div>
          <div className="workflow-visual wf-ownership">
            <div className="wf-ownership-head">
              <span>Owner</span>
              <span>Rock</span>
              <span>Progress</span>
              <span>Due</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar">MK</span>
              <span>Ship EMEA billing</span>
              <span className="wf-bar"><span style={{ width: "82%" }} /></span>
              <span className="wf-due">Sep 30</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-2">JT</span>
              <span>Hire 4 AEs</span>
              <span className="wf-bar"><span style={{ width: "50%" }} /></span>
              <span className="wf-due">Oct 15</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-3">AP</span>
              <span>Onboarding v2</span>
              <span className="wf-bar"><span style={{ width: "95%" }} /></span>
              <span className="wf-due">Sep 18</span>
            </div>
          </div>
        </article>

        {/* Row 2 — 3 narrower cards */}
        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Track progress</h3>
            <p className="workflow-body">
              Real-time visibility into every KPI, flagged red, yellow, or green.
            </p>
          </div>
          <div className="workflow-visual wf-progress">
            <div className="wf-progress-head">
              <span>Performance</span>
              <span className="wf-progress-pct">86%</span>
            </div>
            <div className="wf-bars">
              {[78, 92, 65, 88, 95, 72, 90].map((h, i) => (
                <span
                  key={i}
                  className="wf-bar-vertical"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <span className="wf-progress-meta">+15% vs last week</span>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Run the rhythm</h3>
            <p className="workflow-body">
              Daily huddles, weekly L10s, quarterly planning — agendas linked to Rocks.
            </p>
          </div>
          <div className="workflow-visual wf-rhythm">
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-people" />
              <div>
                <span className="wf-rhythm-title">Monday L10</span>
                <span className="wf-rhythm-time">09:00 · 60 min</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-execution" />
              <div>
                <span className="wf-rhythm-title">Daily huddle</span>
                <span className="wf-rhythm-time">Every day · 15 min</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-strategy" />
              <div>
                <span className="wf-rhythm-title">Monthly leadership</span>
                <span className="wf-rhythm-time">First Wed · 2 hr</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Review & repeat</h3>
            <p className="workflow-body">
              Close the quarter with clarity. See completion rates and carry forward what
              matters.
            </p>
          </div>
          <div className="workflow-visual wf-review">
            <div className="wf-review-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" className="wf-ring-bg" />
                <circle cx="50" cy="50" r="42" className="wf-ring-fg" />
              </svg>
              <div className="wf-ring-label">
                <span className="wf-ring-value">12 / 12</span>
                <span className="wf-ring-text">Rocks done</span>
              </div>
            </div>
            <div className="wf-review-meta">
              <span className="wf-review-chip">
                <span className="wf-dot pillar-execution" />
                Q3 closed
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
