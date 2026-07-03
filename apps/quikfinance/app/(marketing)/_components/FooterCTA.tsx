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
          <span className="serif">Your books deserve a workspace</span>{" "}
          <span className="serif-bold">built for the way you work.</span>
        </h2>
        <p className="section-lede" style={{ maxWidth: 520, margin: "0 auto 28px" }}>
          Invoicing, banking, GST, and reports — all in one place. No credit card
          required. Your first invoice out in under a week.
        </p>
        <div className="cta-row footer-actions">
          <a href="/login" className="btn btn-dark btn-lg">Start your free trial</a>
        </div>
      </div>

      <footer className="site-footer">
        <div className="site-footer-brand">
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              height: 28,
              width: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: "linear-gradient(135deg,#2d88ff,#1e6fe0)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            QF
          </span>
          <span className="site-footer-name"><strong>QuikFinance</strong> · part of the Quikit product suite</span>
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
