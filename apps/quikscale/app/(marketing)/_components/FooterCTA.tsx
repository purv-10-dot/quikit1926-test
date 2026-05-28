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
          <span className="serif">Your next</span>{" "}
          <span className="serif-bold">quarterly planning session</span>{" "}
          <span className="serif">starts here.</span>
        </h2>
        <div className="cta-row footer-actions">
          <a href="#demo" className="btn btn-dark btn-lg">Book a demo</a>
          <a href="#start" className="btn btn-ghost btn-lg">Start free</a>
        </div>
      </div>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <span className="logo logo-sm" aria-hidden="true">
            <span className="logo-mark">q</span>
          </span>
          <span className="site-footer-name">
            <strong>QuikScale</strong> · part of the <span className="serif">Quikit</span> Organization OS
          </span>
        </div>
        <div className="site-footer-meta">
          <span>© 2026 Quikit</span>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#security">Security</a>
        </div>
      </footer>
    </section>
  );
}
