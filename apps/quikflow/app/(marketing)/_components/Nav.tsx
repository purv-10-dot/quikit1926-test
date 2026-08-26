import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Public marketing nav for QuikFlow's landing page.
 *
 * Login button redirects to the central QuikIT login with a `callbackUrl`
 * that returns the user to `/dashboard` on this app's origin after a
 * successful sign-in — mirrors apps/quikscale/app/(marketing)/_components/Nav.tsx.
 *
 * No "Sign Up" CTA: QuikFlow access is granted by a super-admin via
 * OrgAppAccess/UserAppAccess (see @quikit/auth/app-access), not self-serve
 * registration.
 *
 * `NEXT_PUBLIC_QUIKFLOW_URL` is baked at build time — literal access here so
 * webpack inlines it into the client bundle (see packages/shared/lib/env.ts).
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKFLOW_URL ?? "http://localhost:3014",
  postLoginPath: "/dashboard",
});

export default function Nav() {
  return (
    <nav className="nav site-nav" aria-label="Primary">
      <a href="/" className="nav-logo" aria-label="QuikFlow">
        QuikFlow
      </a>
      <span className="nav-spacer" />
      <a href={LOGIN_HREF} className="btn btn-dark">
        Login
      </a>
    </nav>
  );
}
