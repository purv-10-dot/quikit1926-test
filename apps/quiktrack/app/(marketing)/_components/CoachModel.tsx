const tiers = [
  { team: "QuikTrack", jira: "Engineering", quik: "Sprints · Releases · Issues", saving: "Connected" },
  { team: "QuikCRM", jira: "Sales", quik: "Pipeline · Deals · Follow-ups", saving: "Connected" },
  { team: "QuikScale", jira: "Leadership", quik: "OKRs · KPIs · Strategy", saving: "Connected" },
] as const;

export default function CoachModel() {
  return (
    <section id="savings" className="surface-card section-card coach-card">
      <div className="coach-grid">
        <div className="coach-copy">
          <span className="section-eyebrow on-dark">The Quikit OS</span>
          <h2 className="section-title on-dark">
            <span className="serif">One connected suite.</span>{" "}
            <span className="serif-bold">Every team, in sync.</span>
          </h2>
          <p className="section-lede on-dark">
            QuikTrack doesn't operate in isolation. When a deal closes in QuikCRM, a
            project opens automatically in QuikTrack. Engineering KPIs flow into
            QuikScale. One operating system for your entire company.
          </p>
          <ul className="coach-list">
            <li>Real-time data flow across product, engineering, and sales</li>
            <li>One source of truth from lead to launch</li>
            <li>No integrations to maintain — it's all built-in</li>
            <li>Quikit OS — built for Indian businesses, priced for growth</li>
          </ul>
        </div>

        <div className="coach-visual">
          <div className="coach-header">
            <span className="coach-title">Quikit OS · Connected functions</span>
            <span className="coach-count">One suite, every team</span>
          </div>
          <div className="coach-clients">
            {tiers.map((t) => (
              <div className="client-row" key={t.team}>
                <span className="client-name">{t.team}</span>
                <span className="cost-figures">
                  <span className="cost-jira">{t.jira}</span>
                  <span className="cost-arrow" aria-hidden="true">→</span>
                  <span className="cost-quik">{t.quik}</span>
                </span>
                <span className="client-meta">{t.saving}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
