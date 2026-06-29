import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

// Accept both env names — operators sometimes provision the IdP base URL
// under the OIDC-conventional alias QUIKIT_ISSUER_URL. Reading only QUIKIT_URL
// silently drops the app into credentials mode (no "quikit" provider), which
// makes signIn("quikit") on /login loop back to /login forever. Mirrors
// quikscale / quikvc / quikcrm.
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
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
