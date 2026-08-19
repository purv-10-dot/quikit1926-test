export default function Hero() {
  return (
    <section className="hero-card">
      <div className="hero-eyebrow">NO-CODE AUTOMATION · ONE CANVAS</div>

      <h1 className="hero-title">
        Connect every QuikIT app.
        <br />
        <span className="accent">Automate the busywork.</span>{" "}
        <span className="muted">Not the judgment calls.</span>
      </h1>

      <div className="hero-row">
        <p className="hero-desc">
          QuikFlow lets you wire triggers, actions, and approvals across
          QuikScale, QuikChat, QuikHRMS and the rest of the QuikIT suite —
          meeting notes that create KPI updates, approvals that route
          themselves, notifications that fire on their own. No engineering
          ticket required.
        </p>
        <div className="hero-cta-group">
          <a href="/login" className="btn btn-primary btn-lg">
            Open QuikFlow
          </a>
        </div>
      </div>

      <div className="hero-image" aria-hidden="true">
        <div className="wf-mock">
          <div className="wf-chrome">
            <span className="wf-dot wf-dot-a" />
            <span className="wf-dot wf-dot-b" />
            <span className="wf-dot wf-dot-c" />
            <span className="wf-chrome-title">Meeting Follow-up · Active</span>
          </div>

          <div className="wf-flow">
            <div className="wf-node wf-node-trigger">
              <span className="wf-badge wf-badge-trigger">Trigger</span>
              <span className="wf-node-icon">🎥</span>
              <span className="wf-node-label">Fathom meeting ends</span>
            </div>

            <span className="wf-connector" />

            <div className="wf-node wf-node-condition">
              <span className="wf-badge wf-badge-condition">Condition</span>
              <span className="wf-node-icon">🔀</span>
              <span className="wf-node-label">KPI dropped below target?</span>
            </div>

            <span className="wf-connector wf-connector-branch" />

            <div className="wf-branch-row">
              <div className="wf-node wf-node-action">
                <span className="wf-badge wf-badge-action">Action</span>
                <span className="wf-node-icon">📊</span>
                <span className="wf-node-label">Update KPI in QuikScale</span>
              </div>
              <div className="wf-node wf-node-action">
                <span className="wf-badge wf-badge-action">Action</span>
                <span className="wf-node-icon">💬</span>
                <span className="wf-node-label">Post summary to QuikChat</span>
              </div>
            </div>

            <span className="wf-connector" />

            <div className="wf-node wf-node-action wf-node-final">
              <span className="wf-badge wf-badge-action">Action</span>
              <span className="wf-node-icon">🔔</span>
              <span className="wf-node-label">Notify the KPI owner</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
