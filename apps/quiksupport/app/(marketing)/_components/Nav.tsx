import { buildLoginUrl } from "@quikit/shared/login-url";

// Literal env access so Next inlines it into the client bundle at build time.
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKSUPPORT_URL ?? "http://localhost:3010",
  postLoginPath: "/dashboard",
});

// Self-serve registration lives on the central QuikAuth /register wizard
// (workspace → OTP → password), which signs the user in and lands them on the
// launcher /apps grid. Same dev fallback (:3001) as the login handoff.
const SIGNUP_HREF = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")}/register`;

export function Nav() {
  return (
    <nav className="qs-nav">
      <div className="qs-nav-inner">
        <div className="qs-brand">
          <span className="qs-logo">Q</span>
          <span className="qs-brand-name">QuikSupport</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a className="qs-btn qs-btn-primary" href={LOGIN_HREF}>
            Sign in
          </a>
          <a
            className="qs-btn"
            href={SIGNUP_HREF}
            style={{ border: "1px solid var(--qs-border, rgba(148,163,184,0.4))" }}
          >
            Sign Up
          </a>
        </div>
      </div>
    </nav>
  );
}
