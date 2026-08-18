import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Public marketing nav for crmexpress.quikit.ai/.
 *
 * Login bounces to the central QuikAuth login with a `callbackUrl` that
 * returns the user to `/dashboard` on this app's origin. The auth app's
 * `redirect` callback (packages/auth/index.ts) allow-lists the sub-app
 * origins so the cross-origin return is honoured.
 *
 * NEXT_PUBLIC_* vars are inlined at build time, so they must be read as
 * literals here — never `process.env[name]` — or webpack cannot substitute
 * them into the client bundle.
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCRMEXPRESS_URL ?? "http://localhost:3017",
  postLoginPath: "/dashboard",
});

// Self-serve registration is centralised on the QuikAuth /register wizard,
// which signs the user in and lands them on the launcher /apps grid.
const SIGNUP_HREF = `${(
  process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001"
).replace(/\/$/, "")}/register`;

export default function Nav() {
  return (
    <nav className="nav site-nav" aria-label="Primary">
      <a href="/" className="logo-link" aria-label="QuikCRMExpress">
        Quik<span>CRM</span>Express
      </a>
      <span className="nav-spacer" />
      <a href={LOGIN_HREF} className="btn btn-dark">
        Login
      </a>
      <a href={SIGNUP_HREF} className="btn btn-ghost">
        Sign Up
      </a>
    </nav>
  );
}
