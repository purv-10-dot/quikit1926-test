import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Public marketing nav for track.quikit.ai/.
 *
 * Login button redirects to the central QuikAuth login with a `callbackUrl`
 * that returns the user to `/dashboard` on this app's origin after a
 * successful sign-in. The auth app's `redirect` callback (see
 * packages/auth/index.ts) allow-lists the quiktrack origin so the
 * cross-origin return is honoured.
 *
 * `NEXT_PUBLIC_*_URL` env vars are baked at build time by next build (literal
 * access — see packages/shared/lib/env.ts for why we never use dynamic
 * `process.env[name]` in client components).
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl:
    process.env.NEXT_PUBLIC_QUIKTRACK_URL ?? "http://localhost:3004",
  postLoginPath: "/dashboard",
});

export default function Nav() {
  return (
    <nav className="nav site-nav" aria-label="Primary">
      <a href="/" className="logo-link" aria-label="QuikTrack">
        <img src="/marketing/logo.png" alt="QuikTrack" className="logo-img" />
      </a>
      <span className="nav-spacer" />
      <a href={LOGIN_HREF} className="btn btn-dark">
        Login
      </a>
    </nav>
  );
}
