import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Cross-app login URL. Must read NEXT_PUBLIC_QUIKASSET_URL *literally* so
 * webpack's DefinePlugin inlines it into the client bundle at build time.
 */
export const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKASSET_URL ?? "http://localhost:3009",
  postLoginPath: "/dashboard",
});
