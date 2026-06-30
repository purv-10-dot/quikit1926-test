import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikCRM auth configuration.
 *
 * When QUIKIT_URL + QUIKIT_CLIENT_ID + QUIKIT_CLIENT_SECRET are set, QuikCRM
 * authenticates via QuikIT's OAuth2/OIDC flow (the platform IdP model — same
 * as quikscale, quikvc, quikconstruction).
 *
 * Falls back to the direct CredentialsProvider only when those vars are
 * unset, which should never happen outside very early local bring-up.
 *
 * Pattern mirrors apps/quikvc/lib/auth.ts — including the QUIKIT_ISSUER_URL
 * alias. Some deployments provision the IdP base URL under the OIDC-conventional
 * name QUIKIT_ISSUER_URL instead of QUIKIT_URL; both mean the same thing. Reading
 * only QUIKIT_URL is what silently dropped QuikCRM into credentials mode in
 * production — no "quikit" provider, so signIn("quikit") on /login looped back
 * to /login forever. quikscale / quikvc / quiksocial / quikinfra all read the
 * alias; QuikCRM now matches.
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
