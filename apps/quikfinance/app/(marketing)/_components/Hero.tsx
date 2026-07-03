/**
 * Hero with a bespoke, CSS-built QuikFinance product mockup (no stock photo /
 * borrowed asset) — a faux "Command Center" preview: cash position, receivables
 * vs payables, a sparkline, and a GST/reconciliation strip.
 */
export default function Hero() {
  const spark = [38, 52, 44, 61, 57, 72, 68, 84, 79, 96];
  const max = Math.max(...spark);
  const pts = spark
    .map((v, i) => `${(i / (spark.length - 1)) * 100},${40 - (v / max) * 34}`)
    .join(" ");

  return (
    <section className="hero-card surface-card hero-bold">
      <h1 className="hero-bold-title">
        <span className="hero-bold-line">The Finance Workspace That</span>
        <span className="hero-bold-line">
          <span className="accent-primary serif-bold">Closes Your Books Faster.</span>
        </span>
      </h1>

      <div className="hero-bold-divider" />

      <div className="hero-bold-row">
        <p className="hero-bold-desc">
          Invoicing, billing, banking, GST, and reports — all connected in one fast,
          intelligent workspace.{" "}
          <strong>Real-time visibility from the first invoice to a filed return. No add-ons. No paywalled features.</strong>
        </p>
        <a href="/login" className="btn-bold-cta">
          START FREE TRIAL
        </a>
      </div>

      <div className="hero-bold-image">
        <div
          style={{
            width: "100%",
            borderRadius: 16,
            overflow: "hidden",
            background: "#fff",
            border: "1px solid #e7ebf3",
            boxShadow: "0 24px 60px rgba(15,23,42,0.14)",
          }}
        >
          {/* window chrome */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #eef1f6", background: "#fafbfd" }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
            <span style={{ marginLeft: 12, fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
              app.quikfinance.ai/dashboard
            </span>
          </div>

          {/* body */}
          <div style={{ padding: 20, background: "#f6f8fc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Command Center</span>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Tuesday, 30 June</span>
            </div>

            {/* hero metric */}
            <div style={{ borderRadius: 14, padding: 18, color: "#fff", background: "linear-gradient(135deg,#2d88ff,#1e6fe0)", boxShadow: "0 10px 24px rgba(45,136,255,0.32)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Today's Cash Position</div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, letterSpacing: "-0.02em" }}>₹12,84,500</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.2)", padding: "4px 9px", borderRadius: 99 }}>▲ 12.4%</span>
              </div>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: 40, marginTop: 10 }}>
                <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* two tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #eceff5" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>↗ Receivables</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 3 }}>₹3,42,000</div>
                <div style={{ fontSize: 10.5, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>92% collected</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #eceff5" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>↘ Payables</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 3 }}>₹1,18,500</div>
                <div style={{ fontSize: 10.5, color: "#d97706", fontWeight: 700, marginTop: 2 }}>3 due this week</div>
              </div>
            </div>

            {/* gst / recon strip */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "7px 11px", borderRadius: 99 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#22c55e" }} /> GSTR-3B ready · files 20 Jul
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#1e40af", background: "#dbeafe", padding: "7px 11px", borderRadius: 99 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#3b82f6" }} /> Bank reconciled 96%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
