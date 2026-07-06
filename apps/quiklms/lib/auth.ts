/**
 * NextAuth options for QuikLMS — a centralized-auth CONSUMER app.
 *
 * Primary mode: QuikIT OAuth SSO. When the QUIKIT_* envs are present the app is
 * a pure OAuth client of the QuikIT IdP (identical to quikscale/quikcrm) — it
 * never sees a password. The `createAuthOptions` branch is only a local
 * bring-up fallback so builds/dev don't hard-crash when the envs are absent; it
 * is not used in any deployed environment.
 *
 * IMPORTANT: read the `QUIKIT_ISSUER_URL` alias too. A production incident in a
 * sibling app proved that reading only `QUIKIT_URL` silently drops the app into
 * credentials mode, where `signIn("quikit")` loops back to /login.
 */
import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

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
