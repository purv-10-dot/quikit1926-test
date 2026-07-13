import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Public marketing nav for scale.quikit.ai/.
 *
 * Login button redirects to the central QuikAuth login with a `callbackUrl`
 * that returns the user to `/dashboard` on this app's origin after a
 * successful sign-in. The auth app's `redirect` callback (see
 * packages/auth/index.ts) allow-lists the quikscale origin so the
 * cross-origin return is honoured.
 *
 * `NEXT_PUBLIC_*_URL` env vars are baked at build time by the Dockerfile
 * / next build (literal access — see packages/shared/lib/env.ts for why
 * we never use dynamic `process.env[name]` in client components).
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl:
    process.env.NEXT_PUBLIC_QUIKSCALE_URL ?? "http://localhost:3003",
  postLoginPath: "/dashboard",
});

// Self-serve registration is centralised on the QuikAuth app's /register
// wizard (workspace → OTP → password), which signs the user in and lands them
// on the launcher /apps grid. Literal NEXT_PUBLIC_AUTH_URL access so webpack
// inlines it into the client bundle; same dev fallback (:3001) as buildLoginUrl.
const SIGNUP_HREF = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")}/register`;

export default function Nav() {
  return (
    <nav className="nav site-nav" aria-label="Primary">
      <a href="/" className="logo-link" aria-label="QuikScale">
        <img src="/marketing/logo.png" alt="QuikScale" className="logo-img" />
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
