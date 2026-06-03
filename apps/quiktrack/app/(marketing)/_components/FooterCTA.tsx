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
          <span className="serif">Your team deserves a workspace</span>{" "}
          <span className="serif-bold">built for the way they work.</span>
        </h2>
        <p className="section-lede" style={{ maxWidth: 520, margin: "0 auto 28px" }}>
          Sprint boards, backlog, issue tracking, and custom workflows — all in one
          place. No credit card required. Your first sprint up in under a week.
        </p>
        <div className="cta-row footer-actions">
          <a href="#start" className="btn btn-dark btn-lg">Start your free trial</a>
        </div>
      </div>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <img src="/logo.png" alt="QuikTrack" className="site-footer-logo" />
          <span className="site-footer-name"><strong>QuikTrack</strong> · part of the Quikit product suite</span>
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
