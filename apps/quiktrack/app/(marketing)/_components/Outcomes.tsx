export default function Outcomes() {
  return (
    <section id="outcomes" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The problem</span>
        <h2 className="section-title">
          <span className="serif">₹33,000/month for a tool</span>{" "}
          <span className="serif-bold">your team uses at 20% capacity.</span>
        </h2>
        <p className="section-lede">
          Jira was priced for Atlassian&apos;s enterprise clients — not Indian startups.
          Add Confluence and a couple of plugins, and your bill is two to three times the
          base price. Finance flags it. Engineers say it&apos;s slow. There&apos;s a
          better option.
        </p>
      </header>

      <div className="outcomes-grid">
        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">90%</span>
            <span className="outcome-unit">lower cost than Jira</span>
          </div>
          <h3 className="outcome-title serif-bold">₹660/user vs ₹66</h3>
          <p className="outcome-body">
            Jira Standard runs about ₹660 per user per month. QuikTrack runs about ₹66 —
            for identical core functionality. Same features, different invoice.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">₹3.5L</span>
            <span className="outcome-unit">saved every year</span>
          </div>
          <h3 className="outcome-title serif-bold">For a 50-person team</h3>
          <p className="outcome-body">
            INR pricing, no exchange-rate risk, everything included in the base plan. No
            Confluence, no Tempo, no surprise USD renewal quote.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">&lt; 1</span>
            <span className="outcome-unit">week to migrate</span>
          </div>
          <h3 className="outcome-title serif-bold">Live in under a week</h3>
          <p className="outcome-body">
            Import your Jira projects, boards, and issue history. Your team&apos;s workflow
            doesn&apos;t change — only the invoice does.
          </p>
        </article>
      </div>
    </section>
  );
}
