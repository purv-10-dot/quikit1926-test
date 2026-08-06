import Link from "next/link";

// Public, first-contact marketing page (server component). Uses the design-system
// tokens in globals.css (.lp-* classes) so it respects light/dark automatically.

const FEATURES = [
  { icon: "📊", title: "Every channel, one view", body: "GA4, Search Console, Meta, LinkedIn, YouTube, HubSpot and more — unified into a single live dashboard." },
  { icon: "🤖", title: "Ask AI, grounded in your data", body: "Ask plain-English questions and get answers tied to your real metrics, not generic guesses." },
  { icon: "🔌", title: "Real connectors in minutes", body: "Connect your marketing and CRM stack with secure OAuth — no CSVs, no manual exports." },
  { icon: "🎯", title: "Insights that tell you what to do", body: "Automatic, rule-based recommendations across SEO, social, and sales — surfaced the moment they matter." },
  { icon: "👥", title: "Team & OKRs in context", body: "See execution and objectives beside the numbers they move, backed by the tools you already use." },
  { icon: "✉️", title: "Reports that send themselves", body: "Scheduled email digests keep leadership aligned without anyone building a slide." },
];

const CONNECTORS = ["Google Analytics 4", "Meta", "LinkedIn", "HubSpot", "Salesforce", "YouTube", "Mailchimp"];

function Brand() {
  return (
    <div className="lp-brand">
      <span className="lp-brand-mark">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      </span>
      QuikInsight
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <Brand />
        <div className="lp-nav-actions">
          <Link href="/login" className="lp-btn lp-btn-primary">Sign in</Link>
        </div>
      </nav>

      <header className="lp-hero">
        <span className="lp-eyebrow">✨ AI Growth OS for Marketing</span>
        <h1 className="lp-h1">See every marketing channel clearly — and know what to do next.</h1>
        <p className="lp-sub">
          QuikInsight unifies your analytics, ads, social, and CRM into one live dashboard,
          then uses AI grounded in your real numbers to tell you where to grow.
        </p>
        <div className="lp-cta-row">
          <Link href="/login" className="lp-btn lp-btn-primary">Sign in →</Link>
        </div>
        <div className="lp-trust">
          {CONNECTORS.map((c) => <span className="lp-chip" key={c}>{c}</span>)}
        </div>

        {/* Pure-CSS product preview */}
        <div className="lp-preview" aria-hidden>
          <div className="lp-preview-bar">
            <span className="lp-dot" style={{ background: "#FF5F57" }} />
            <span className="lp-dot" style={{ background: "#FEBC2E" }} />
            <span className="lp-dot" style={{ background: "#28C840" }} />
          </div>
          <div className="lp-preview-body">
            <div className="lp-kpis">
              <div className="lp-kpi"><div className="k">Reach</div><div className="v">1.2M</div></div>
              <div className="lp-kpi"><div className="k">Engagement</div><div className="v">4.8%</div></div>
              <div className="lp-kpi"><div className="k">Leads</div><div className="v">430</div></div>
              <div className="lp-kpi"><div className="k">Pipeline</div><div className="v">$1.6M</div></div>
            </div>
            <div className="lp-bars">
              {[52, 68, 45, 80, 61, 92, 74, 88].map((h, i) => (
                <div className="lp-bar" style={{ height: `${h}%` }} key={i} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="lp-section">
        <h2 className="lp-section-title">Everything your growth team needs</h2>
        <p className="lp-section-sub">From first click to closed revenue — measured, explained, and acted on.</p>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <div className="lp-feature" key={f.title}>
              <div className="lp-feature-ic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-band">
        <h2>Ready to see your growth clearly?</h2>
        <p>Connect your first platform in minutes. No credit card required.</p>
        <Link href="/signup" className="lp-btn lp-btn-primary">Create your account →</Link>
      </section>

      <footer className="lp-footer">
        <Brand />
        <span>© {new Date().getFullYear()} QuikInsight · AI Growth OS for Marketing</span>
      </footer>
    </div>
  );
}
