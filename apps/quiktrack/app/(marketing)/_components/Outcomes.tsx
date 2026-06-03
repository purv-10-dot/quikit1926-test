export default function Outcomes() {
  return (
    <section id="outcomes" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The advantage</span>
        <h2 className="section-title">
          <span className="serif">The command centre for every sprint,</span>{" "}
          <span className="serif-bold">story, and release.</span>
        </h2>
        <p className="section-lede">
          From sprint planning to post-release retrospectives — QuikTrack gives your
          team the visibility, speed, and flexibility to ship with confidence, every
          single cycle.
        </p>
      </header>

      <div className="outcomes-grid">
        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">3×</span>
            <span className="outcome-unit">faster sprint planning</span>
          </div>
          <h3 className="outcome-title serif-bold">Visual boards built for speed</h3>
          <p className="outcome-body">
            Drag-to-prioritize backlogs, real-time sprint goals, and velocity reports on
            one screen. No pre-sprint spreadsheets. No back-and-forth in Slack.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">100%</span>
            <span className="outcome-unit">issue visibility</span>
          </div>
          <h3 className="outcome-title serif-bold">Nothing buried, nothing dropped</h3>
          <p className="outcome-body">
            Every bug, task, and feature request has an owner, a status, and a due date.
            Full epic → story → task hierarchy with linked PRs and threaded comments.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">&lt; 5</span>
            <span className="outcome-unit">days to first sprint</span>
          </div>
          <h3 className="outcome-title serif-bold">Up and running immediately</h3>
          <p className="outcome-body">
            Intuitive setup means your team is running their first sprint within days —
            not weeks. No lengthy onboarding, no training sessions required.
          </p>
        </article>
      </div>
    </section>
  );
}
