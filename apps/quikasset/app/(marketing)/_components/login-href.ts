import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Cross-app login URL. Must read NEXT_PUBLIC_QUIKASSET_URL *literally* so
 * webpack's DefinePlugin inlines it into the client bundle at build time.
 */
export const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKASSET_URL ?? "http://localhost:3012",
  // Land on "/", whose server redirect routes by permission (admins →
  // /dashboard, plain Members → /employee-view). /dashboard 403s for Members.
  postLoginPath: "/",
});

/**
 * Self-serve registration lives on the central QuikAuth /register wizard
 * (workspace → OTP → password), which signs the user in and lands them on the
 * launcher /apps grid. Literal NEXT_PUBLIC_AUTH_URL access so webpack inlines
 * it into the client bundle; dev fallback :3001.
 */
export const SIGNUP_HREF = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")}/register`;
