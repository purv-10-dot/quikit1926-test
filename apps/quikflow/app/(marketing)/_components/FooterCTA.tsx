export default function FooterCTA() {
  return (
    <section className="section-card footer-card">
      <div className="footer-cta">
        <h2 className="footer-title">
          Your team already has the process. Give it a canvas.
        </h2>
        <p className="footer-subtitle">
          Ask your workspace admin to grant QuikFlow access from the QuikIT
          launcher — you&rsquo;ll be building your first workflow in minutes.
        </p>
        <div className="footer-actions">
          <a href="/login" className="btn btn-dark btn-lg">Open QuikFlow</a>
        </div>
        <p className="footer-fine">
          Access is granted per-organization by your QuikIT administrator.
        </p>
      </div>

      <footer className="site-footer">
        <div className="site-footer-brand">QuikFlow</div>
        <div className="site-footer-meta">
          <span>© 2026 Quikit</span>
        </div>
      </footer>
    </section>
  );
}
