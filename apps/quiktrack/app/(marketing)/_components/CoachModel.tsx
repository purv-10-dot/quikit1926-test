const tiers = [
  { team: "20 engineers", jira: "₹13,200", quik: "₹1,320", saving: "—" },
  { team: "50 engineers", jira: "₹33,000", quik: "₹3,300", saving: "₹3.56L / yr" },
  { team: "100 engineers", jira: "₹66,000", quik: "₹6,600", saving: "₹7.12L / yr" },
] as const;

export default function CoachModel() {
  return (
    <section id="savings" className="surface-card section-card coach-card">
      <div className="coach-grid">
        <div className="coach-copy">
          <span className="section-eyebrow on-dark">Reduce Jira costs</span>
          <h2 className="section-title on-dark">
            <span className="serif">Same features.</span>{" "}
            <span className="serif-bold">The math is hard to argue with.</span>
          </h2>
          <p className="section-lede on-dark">
            Jira Standard runs about ₹660/user/month. QuikTrack runs about ₹66 — 90% less
            for the sprint boards, backlog, and bug tracking your team already uses.
          </p>
          <ul className="coach-list">
            <li>INR pricing — no dollar-rupee exchange-rate risk</li>
            <li>Everything in the base plan — no Confluence or Tempo add-ons</li>
            <li>Migrate from Jira in under a week, workflow unchanged</li>
            <li>Part of the Quikit OS — QuikCRM, QuikTrack, QuikScale connected</li>
          </ul>
        </div>

        <div className="coach-visual">
          <div className="coach-header">
            <span className="coach-title">Cost comparison · per month</span>
            <span className="coach-count">Jira → QuikTrack</span>
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
