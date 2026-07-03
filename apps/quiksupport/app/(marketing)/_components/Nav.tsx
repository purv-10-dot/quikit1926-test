import { buildLoginUrl } from "@quikit/shared/login-url";

// Literal env access so Next inlines it into the client bundle at build time.
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKSUPPORT_URL ?? "http://localhost:3010",
  postLoginPath: "/dashboard",
});

export function Nav() {
  return (
    <nav className="qs-nav">
      <div className="qs-nav-inner">
        <div className="qs-brand">
          <span className="qs-logo">Q</span>
          <span className="qs-brand-name">QuikSupport</span>
        </div>
        <a className="qs-btn qs-btn-primary" href={LOGIN_HREF}>
          Sign in
        </a>
      </div>
    </nav>
  );
}
