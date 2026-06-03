/**
 * NextAuth configuration — central-auth only.
 *
 * QuikInfra has no local /login page and no credentials provider. Auth is
 * delegated to the central QuikIT auth service via OAuth2/OIDC. The session
 * cookie is planted on this host by /auth-handoff after the launcher mints a
 * short-lived handoff token; the cn_users row is resolved server-side from
 * the email claim inside getTenantContext().
 *
 * If the QUIKIT_* env vars are missing the app intentionally refuses to boot
 * the auth route handler — there is no local-credentials fallback to mask the
 * misconfiguration.
 */

import type { NextAuthOptions } from "next-auth";
import { createOAuthClientOptions } from "@quikit/auth";
import "@quikit/auth/types";

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

if (!QUIKIT_URL || !QUIKIT_CLIENT_ID || !QUIKIT_CLIENT_SECRET) {
  throw new Error(
    "QuikInfra auth misconfigured: QUIKIT_URL, QUIKIT_CLIENT_ID, and " +
      "QUIKIT_CLIENT_SECRET are required (central auth is the only login path).",
  );
}

export const authOptions: NextAuthOptions = createOAuthClientOptions({
  quikitUrl: QUIKIT_URL,
  clientId: QUIKIT_CLIENT_ID,
  clientSecret: QUIKIT_CLIENT_SECRET,
});
