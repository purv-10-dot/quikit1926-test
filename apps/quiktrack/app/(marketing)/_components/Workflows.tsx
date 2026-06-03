export default function Workflows() {
  return (
    <section id="workflows" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The Product</span>
        <h2 className="section-title">
          <span className="serif">Everything your engineering team needs.</span>{" "}
          <span className="serif-bold">All in one workspace.</span>
        </h2>
        <p className="section-lede">
          Sprint boards, issue tracking, custom workflows, velocity reporting, and
          release management — connected in a single, fast, intuitive workspace.
        </p>
      </header>

      <div className="workflows-grid">
        {/* Row 1 — 2 wide cards */}
        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Sprint Boards — Scrum &amp; Kanban</h3>
            <p className="workflow-body">
              Full Scrum and Kanban support — sprint planning, WIP limits, velocity, and
              burndown on one screen. The same board your engineers learned on Jira,
              without the page-reload lag.
            </p>
          </div>
          <div className="workflow-visual wf-opsp">
            <div className="wf-tabs">
              <span className="wf-tab active">Sprint</span>
              <span className="wf-tab">Backlog</span>
              <span className="wf-tab">Board</span>
              <span className="wf-tab">Reports</span>
            </div>
            <div className="wf-opsp-grid">
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Sprint goal</span>
                <span className="wf-opsp-value">Checkout v2</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Velocity</span>
                <span className="wf-opsp-value">42 pts / sprint</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Committed</span>
                <span className="wf-opsp-value">38 story points</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">In progress</span>
                <span className="wf-opsp-value">6 issues</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Bug &amp; Issue Tracking</h3>
            <p className="workflow-body">
              Nothing buried in Slack, nothing quietly dropped. Every issue gets an owner,
              an estimate, and a link to the PR — captured with full epic → story → task
              hierarchy.
            </p>
          </div>
          <div className="workflow-visual wf-ownership">
            <div className="wf-ownership-head">
              <span>Owner</span>
              <span>Issue</span>
              <span>Progress</span>
              <span>Due</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar">MK</span>
              <span>Fix payment retry</span>
              <span className="wf-bar"><span style={{ width: "82%" }} /></span>
              <span className="wf-due">Sep 30</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-2">JT</span>
              <span>Login SSO bug</span>
              <span className="wf-bar"><span style={{ width: "50%" }} /></span>
              <span className="wf-due">Oct 15</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-3">AP</span>
              <span>Search latency</span>
              <span className="wf-bar"><span style={{ width: "95%" }} /></span>
              <span className="wf-due">Sep 18</span>
            </div>
          </div>
        </article>

        {/* Row 2 — 3 narrower cards */}
        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Velocity &amp; Reporting</h3>
            <p className="workflow-body">
              See where your team slows down before it shows up in a missed deadline —
              velocity, burndown, and cycle time, no add-on required.
            </p>
          </div>
          <div className="workflow-visual wf-progress">
            <div className="wf-progress-head">
              <span>Velocity</span>
              <span className="wf-progress-pct">42</span>
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
            <span className="wf-progress-meta">+15% vs last sprint</span>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Custom Workflows</h3>
            <p className="workflow-body">
              Build the workflow your team actually uses — custom statuses, transitions,
              and approvals, no Marketplace add-on required.
            </p>
          </div>
          <div className="workflow-visual wf-rhythm">
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-people" />
              <div>
                <span className="wf-rhythm-title">To Do</span>
                <span className="wf-rhythm-time">Backlog · ready</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-execution" />
              <div>
                <span className="wf-rhythm-title">In Progress → In Review</span>
                <span className="wf-rhythm-time">Auto-assign reviewer</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-strategy" />
              <div>
                <span className="wf-rhythm-title">Done</span>
                <span className="wf-rhythm-time">Validator · PR merged</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Release &amp; Version Management</h3>
            <p className="workflow-body">
              Engineering and product both know what&apos;s in the next build before the
              release meeting starts. Group issues into versions, track scope, and ship.
            </p>
          </div>
          <div className="workflow-visual wf-review">
            <div className="wf-review-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" className="wf-ring-bg" />
                <circle cx="50" cy="50" r="42" className="wf-ring-fg" />
              </svg>
              <div className="wf-ring-label">
                <span className="wf-ring-value">v2.4</span>
                <span className="wf-ring-text">Scope ready</span>
              </div>
            </div>
            <div className="wf-review-meta">
              <span className="wf-review-chip">
                <span className="wf-dot pillar-execution" />
                Shipping Fri
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
