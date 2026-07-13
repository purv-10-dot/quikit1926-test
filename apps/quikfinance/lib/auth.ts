import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikFinance auth — SSO client of the central QuikIT IdP (mirrors quiktrack).
 *
 * When QUIKIT_URL/CLIENT_ID/CLIENT_SECRET are set, this app is an OAuth/OIDC
 * client: users are redirected to the launcher to authenticate, then back here
 * with a token carrying their identity + tenant. Otherwise it falls back to the
 * shared direct-auth options (dev convenience only). Do NOT add a local
 * credentials/Google provider here — identity is owned by the platform.
 */
const QUIKIT_URL = process.env.QUIKIT_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

export const authOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({
        quikitUrl: QUIKIT_URL,
        clientId: QUIKIT_CLIENT_ID,
        clientSecret: QUIKIT_CLIENT_SECRET,
      })
    : createAuthOptions({
        signInPage: "/login",
        errorPage: "/login",
      });
