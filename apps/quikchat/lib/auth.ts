import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikChat auth configuration.
 *
 * When QUIKIT_URL + QUIKIT_CLIENT_ID + QUIKIT_CLIENT_SECRET are set, QuikChat
 * authenticates via QuikIT's OAuth2/OIDC flow (the platform IdP model — same
 * as quikcrm, quikscale, quikvc).
 *
 * Falls back to the direct CredentialsProvider only when those vars are
 * unset, which should never happen outside very early local bring-up.
 *
 * The QUIKIT_ISSUER_URL alias is read as a fallback: some deployments provision
 * the IdP base URL under the OIDC-conventional name QUIKIT_ISSUER_URL instead
 * of QUIKIT_URL; both mean the same thing. Reading only QUIKIT_URL is what
 * silently drops an app into credentials mode in production (no "quikit"
 * provider → signIn("quikit") loops back to /login). All platform apps read
 * the alias; QuikChat matches.
 */
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
