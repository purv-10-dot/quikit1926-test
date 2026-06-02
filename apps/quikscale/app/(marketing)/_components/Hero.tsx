export default function Hero() {
  return (
    <section className="hero-card surface-card hero-bold">
      <div className="hero-bold-eyebrow">SCALING UP OS · ONE PLATFORM</div>

      <h1 className="hero-bold-title">
        <span className="hero-bold-line">
          Run People, Strategy, Execution<span className="cash-desktop"> &amp; Cash</span>
        </span>
        <span className="hero-bold-line">
          <span className="cash-laptop">&amp; Cash </span>from <span className="accent-primary serif-bold">One dashboard</span>
        </span>
      </h1>

      <div className="hero-bold-divider" />

      <div className="hero-bold-row">
        <p className="hero-bold-desc">
          QuikScale is the goal and KPI tracking tool built natively on the Scaling Up
          methodology. Replace spreadsheets, status decks, and quarterly chaos with
          real-time control over your OPSP, Rocks, Critical Numbers, and Meeting
          Rhythms — across every team.
        </p>
        <a href="#demo" className="btn-bold-cta">
          TAKE A PRODUCT TOUR
        </a>
      </div>

      <div className="hero-bold-image">
        <img src="/marketing/hero-bg.webp" alt="QuikScale platform" />
      </div>
    </section>
  );
}
