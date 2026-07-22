/**
 * NextAuth options for QuikLMS — a centralized-auth CONSUMER app.
 *
 * QuikLMS is a pure OAuth/OIDC client of the QuikIT IdP (identical to
 * quikhrms/quikscale/quikcrm). It never sees a password.
 *
 * NO CREDENTIALS FALLBACK — deliberate, and the point of this file.
 *
 * This used to read:
 *
 *     export const authOptions =
 *       QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
 *         ? createOAuthClientOptions({ … })
 *         : createAuthOptions({ signInPage: "/login", errorPage: "/login" });
 *
 * `createAuthOptions` builds a full CredentialsProvider that authenticates
 * against `auth.User.password` directly. The platform reserves that for the two
 * identity apps — `apps/auth` and `apps/quikit` — and nothing else (baseline
 * §1). With the ternary above, a single missing or misnamed env var silently
 * promoted QuikLMS into a THIRD credential authority with its own login form,
 * outside the central session/revocation model. That is not a theoretical
 * risk: the comment this file previously carried recorded a production incident
 * in a sibling app caused by exactly this branch being taken by accident.
 *
 * The fix mirrors quikhrms/lib/auth.ts — the only app that had already dropped
 * the fallback. The factory is called unconditionally with empty-string
 * defaults instead of being swapped out:
 *
 *   - It CANNOT silently become a credential authority. There is one code path.
 *   - It does NOT throw at module load, so `next build` and a fresh local clone
 *     still boot (a hard throw here would break the Vercel build whenever the
 *     envs are absent at build time).
 *   - Misconfiguration now fails where it should — at sign-in, as an OAuth
 *     error against a blank issuer — instead of quietly presenting a password
 *     box that appears to work.
 *
 * `QUIKIT_ISSUER_URL` is read as an alias for `QUIKIT_URL`: some deployments
 * provision the IdP base URL under the OIDC-conventional name. Reading only
 * `QUIKIT_URL` is what dropped QuikCRM into credentials mode in production.
 */
import type { NextAuthOptions } from "next-auth";
import { createOAuthClientOptions } from "@quikit/auth";
// Type augmentation for next-auth's Session/JWT (id/orgId/membershipRole/…).
import "@quikit/auth/types";

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL ?? "";

// Falls back to this app's registered slug — it is a fixed, public identifier
// (see packages/database/prisma/seed-oauth.ts), not a secret.
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID ?? "quiklms";

/**
 * Reject literal-placeholder secrets — the variable NAME pasted as its value,
 * or a scaffolding stub. These would otherwise be treated as a real secret and
 * produce a confusing `invalid_client` at the token endpoint instead of an
 * obviously-unconfigured client. NOTE: the dev secret from `.env.example`
 * (`quiklms-dev-secret-change-in-prod`) is intentionally NOT listed — it is a
 * real, working value that `seed-oauth.ts` provisions for local development.
 */
const PLACEHOLDER_VALUES = new Set([
  "QUIKIT_CLIENT_SECRET",
  "your-client-secret",
  "REPLACE_ME",
  "",
]);
const rawSecret = process.env.QUIKIT_CLIENT_SECRET;
const QUIKIT_CLIENT_SECRET =
  rawSecret && !PLACEHOLDER_VALUES.has(rawSecret) ? rawSecret : "";

export const authOptions: NextAuthOptions = createOAuthClientOptions({
  quikitUrl: QUIKIT_URL,
  clientId: QUIKIT_CLIENT_ID,
  clientSecret: QUIKIT_CLIENT_SECRET,
  errorPage: "/login",
});
