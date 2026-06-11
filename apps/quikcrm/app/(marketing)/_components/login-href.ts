import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Central platform login handoff for the QuikCRM marketing landing.
 *
 * Mirrors QuikScale / QuikTrack: bounce to QuikAuth's /login carrying a
 * callbackUrl that returns the user to /dashboard on this app's origin after
 * SSO. `process.env.NEXT_PUBLIC_QUIKCRM_URL` is read literally so webpack can
 * inline it into the client bundle (see packages/shared/lib/login-url.ts).
 */
export const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCRM_URL ?? "http://localhost:3008",
  postLoginPath: "/dashboard",
});
