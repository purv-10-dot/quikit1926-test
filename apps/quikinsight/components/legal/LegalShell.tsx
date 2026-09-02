import Link from "next/link";

const APP_NAME = "QuikInsight";

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

/**
 * Shared chrome for the public legal pages (/legal, /legal/privacy,
 * /legal/terms). Reuses the .lp-* classes from the marketing homepage
 * (Landing.tsx) so these pages read as the same product, not a bolted-on
 * template. Must render without a session — see middleware.ts publicRoutes.
 */
export default function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <Link href="/" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>
        <div className="lp-nav-actions">
          <Link href="/login" className="lp-btn lp-btn-primary">Sign in</Link>
        </div>
      </nav>

      <div className="lp-legal">
        <h1 className="lp-legal-title">{title}</h1>
        {updated && <p className="lp-legal-updated">Last updated: {updated}</p>}
        <div className="lp-legal-body">{children}</div>
      </div>

      <footer className="lp-footer">
        <Brand />
        <span>
          <Link href="/legal/privacy">Privacy Policy</Link>
          {" · "}
          <Link href="/legal/terms">Terms of Service</Link>
        </span>
      </footer>
    </div>
  );
}
