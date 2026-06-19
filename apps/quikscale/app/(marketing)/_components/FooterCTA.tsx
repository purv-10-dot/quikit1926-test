export default function FooterCTA() {
  return (
    <section className="surface-card section-card footer-card">
      <div className="footer-cta">
        <div className="footer-stripe" aria-hidden="true">
          <span className="stripe pillar-people" />
          <span className="stripe pillar-strategy" />
          <span className="stripe pillar-execution" />
          <span className="stripe pillar-cash" />
        </div>
        <h2 className="footer-title">
          <span className="serif">Your Scaling Up plan is only as good as</span>{" "}
          <span className="serif-bold">the system running it.</span>
        </h2>
        <p className="footer-subtitle">
          Keep everything your leadership team built at the offsite. Change what happens
          on Monday morning.
        </p>
        <div className="cta-row footer-actions">
          <a href="#demo" className="btn btn-dark btn-lg">Book a Demo</a>
          <a href="#start" className="btn btn-ghost btn-lg">Start Free</a>
        </div>
        <p className="footer-fine">
          No credit card required. Implementation support included. Live on QuikScale in
          under a week.
        </p>
      </div>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <img src="/logo.png" alt="QuikScale" className="site-footer-logo" />
        </div>
        <div className="site-footer-meta">
          <span>© 2026 Quikit</span>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </div>
      </footer>
    </section>
  );
}
