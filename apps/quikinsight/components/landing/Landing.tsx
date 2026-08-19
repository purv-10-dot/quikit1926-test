import Link from "next/link";

// Public, first-contact marketing page (server component). Uses the design-system
// tokens in globals.css (.lp-* classes) so it respects light/dark automatically.
//
// ── GOOGLE OAUTH VERIFICATION ────────────────────────────────────────────────
// This page is the homepage submitted for Google OAuth app verification, so a
// reviewer must be able to confirm three things WITHOUT signing in:
//
//   1. The application name matches the OAuth consent screen EXACTLY
//      ("QuikInsight"). Google rejected a previous attempt for a name mismatch,
//      so APP_NAME below is the single source of truth for every visible
//      occurrence — do not hardcode the name anywhere else on this page, and do
//      not change it without changing the consent screen in the same PR.
//   2. Who operates the app, and how to reach them.
//   3. What the app does with Google user data — reviewers look for an explicit
//      statement of the scopes' purpose on the homepage itself.
//
// The "home page URL is not registered to you" rejection is NOT fixable here:
// it needs domain ownership verified in Google Search Console under the same
// account that owns the Cloud project. See the notes at the bottom of this file.

/** Must match the OAuth consent screen's "App name" byte for byte. */
const APP_NAME = "QuikInsight";

/** Legal operator shown for verification. Confirm before submitting. */
const OPERATOR = "QuikIT";
const CONTACT_EMAIL = "support@quikit.ai";

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
      {APP_NAME}
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
        {/* The app name leads the H1 so a verification reviewer sees it as the
            page's primary heading, matching the OAuth consent screen. */}
        <h1 className="lp-h1">
          {APP_NAME} — see every marketing channel clearly, and know what to do next.
        </h1>
        <p className="lp-sub">
          {APP_NAME} unifies your analytics, ads, social, and CRM into one live dashboard,
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

      {/* Google OAuth verification: a reviewer must be able to read, without
          signing in, which Google data the app requests and why. Keep this in
          sync with the scopes on the consent screen — a scope listed there but
          not explained here is a rejection reason. */}
      <section className="lp-section" id="google-data">
        <h2 className="lp-section-title">How {APP_NAME} uses your Google data</h2>
        <p className="lp-section-sub">
          {APP_NAME} only requests read access to the accounts you explicitly connect, and
          only to display your own analytics back to you.
        </p>
        <div className="lp-features">
          <div className="lp-feature">
            <div className="lp-feature-ic">📈</div>
            <h3>Google Analytics</h3>
            <p>
              Read-only access to your GA4 property so {APP_NAME} can show sessions, users,
              traffic sources and conversions in your dashboard.
            </p>
          </div>
          <div className="lp-feature">
            <div className="lp-feature-ic">🔍</div>
            <h3>Search Console</h3>
            <p>
              Read-only access to your verified site&apos;s search performance — clicks,
              impressions, queries and pages.
            </p>
          </div>
          <div className="lp-feature">
            <div className="lp-feature-ic">🔒</div>
            <h3>What we never do</h3>
            <p>
              {APP_NAME} never modifies or deletes data in your Google account, never sells
              your data, and never shares it with third parties for advertising.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-band">
        <h2>Ready to see your growth clearly?</h2>
        <p>Connect your first platform in minutes. No credit card required.</p>
        <Link href="/signup" className="lp-btn lp-btn-primary">Create your account →</Link>
      </section>

      <footer className="lp-footer">
        <Brand />
        {/* Operator + contact are verification requirements: a reviewer must be
            able to tell who runs the app and how to reach them. */}
        <span>
          © {new Date().getFullYear()} {APP_NAME} · Operated by {OPERATOR} ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
      </footer>
    </div>
  );
}

/*
 * ── REMAINING VERIFICATION STEPS (not fixable in this file) ──────────────────
 *
 * 1. "The website of your home page URL https://quikit.ai/ is not registered
 *    to you."
 *    Verify domain ownership in Google Search Console using the SAME Google
 *    account that owns the Cloud project, then add it under
 *    APIs & Services → OAuth consent screen → Authorized domains.
 *
 * 2. "The app name QuikInsight ... does not match the app name on your home
 *    page."
 *    The submitted home page is https://quikit.ai/ — the QuikIT LAUNCHER, which
 *    is a different product and does not carry the QuikInsight name. This page
 *    does. Point the consent screen's home page at this app's own origin
 *    (https://insights.quikit.ai/) so the names line up, rather than trying to
 *    rename the launcher.
 *
 * 3. Expect Privacy Policy and Terms URLs to be required next — Google asks for
 *    both on the consent screen and they must be reachable without signing in.
 *    Neither page exists in this app yet.
 */
