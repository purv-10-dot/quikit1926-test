export default function Outcomes() {
  return (
    <section id="outcomes" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">What changes for you</span>
        <h2 className="section-title">
          <span className="serif">Less time chasing updates.</span>{" "}
          <span className="serif-bold">More time running the business.</span>
        </h2>
        <p className="section-lede">
          QuikScale doesn&apos;t add another tool to your stack — it replaces the
          spreadsheets, status decks, and one-off check-ins your team is running on
          today.
        </p>
      </header>

      <div className="outcomes-grid">
        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">4 hrs</span>
            <span className="outcome-unit">/ week saved</span>
          </div>
          <h3 className="outcome-title serif-bold">Stop running status meetings</h3>
          <p className="outcome-body">
            Live dashboards replace the weekly update slide. Walk into Monday already
            knowing where you stand — and so does every team lead.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">100%</span>
            <span className="outcome-unit">priority visibility</span>
          </div>
          <h3 className="outcome-title serif-bold">Every priority has an owner</h3>
          <p className="outcome-body">
            Quarterly Rocks, KPIs, and critical numbers all roll up to one person — and
            up to one source of truth. Nothing falls through.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">3x</span>
            <span className="outcome-unit">faster planning</span>
          </div>
          <h3 className="outcome-title serif-bold">Quarterly planning that sticks</h3>
          <p className="outcome-body">
            Carry forward what works. Close the quarter with a real completion rate, not
            a guess — and step into the next one with a plan that survives week three.
          </p>
        </article>
      </div>
    </section>
  );
}
