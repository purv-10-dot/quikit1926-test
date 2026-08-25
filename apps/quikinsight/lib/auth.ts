import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikInsight auth configuration.
 *
 * SSO via the QuikIT IdP is the ONLY supported flow outside local development.
 * The credentials fallback below exists so the app can be run without the IdP
 * on a laptop — it must never be reachable on a deployed environment.
 *
 * WHY THIS FAILS LOUDLY. This file used to degrade silently: if any QUIKIT_*
 * var was missing it quietly built the credentials config instead. A deployed
 * pod then served a DIFFERENT auth system than the one the app expects, and
 * because app/login/page.tsx calls `signIn("quikit")` — a provider that no
 * longer existed — NextAuth bounced straight back to /login, which re-fired the
 * same sign-in, forever. The symptom was an infinite redirect loop with no
 * error in any log, on any layer. That cost a production outage on
 * insights.quikit.ai; a crash on boot naming the missing variable would have
 * cost one line of a pod log.
 */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

const hasOAuthConfig = Boolean(QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET);

/**
 * Only a local `next dev` may fall back. NODE_ENV is "production" in every
 * deployed environment (UAT included, since UAT runs a production build), so
 * this check covers UAT and prod alike.
 */
const isLocalDev = process.env.NODE_ENV === "development";

/**
 * `next build` runs with NODE_ENV=production but WITHOUT the runtime secrets —
 * the Docker image is built first and env vars are injected by the deployment
 * afterwards. Throwing during the build would break the image instead of
 * catching the misconfiguration, so the check is skipped for that phase only.
 * NEXT_PHASE is set by Next.js itself and is stable across versions (same guard
 * as apps/quikfinance/lib/env.ts and apps/quikinfra/lib/config/env.ts).
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!hasOAuthConfig && !isLocalDev && !isBuildPhase) {
  const missing = [
    !QUIKIT_URL && "QUIKIT_URL (or QUIKIT_ISSUER_URL)",
    !QUIKIT_CLIENT_ID && "QUIKIT_CLIENT_ID",
    !QUIKIT_CLIENT_SECRET && "QUIKIT_CLIENT_SECRET",
  ].filter(Boolean);

  throw new Error(
    `[quikinsight/auth] QuikIT SSO is not configured — missing: ${missing.join(", ")}. ` +
      `These are REQUIRED outside local development; without them the app would ` +
      `serve a credentials login that /login cannot use, producing an infinite ` +
      `redirect loop. Set them on the deployment (client id is "quikinsight") and ` +
      `verify with: curl <origin>/api/auth/providers — it must list "quikit".`,
  );
}

export const authOptions: NextAuthOptions = hasOAuthConfig
  ? createOAuthClientOptions({
      quikitUrl: QUIKIT_URL as string,
      clientId: QUIKIT_CLIENT_ID as string,
      clientSecret: QUIKIT_CLIENT_SECRET as string,
    })
  : // Local development only — guarded by the throw above.
    createAuthOptions({
      signInPage: "/login",
      errorPage: "/login",
    });

/**
 * Drop-in shim for next-auth v5 `auth()` call pattern.
 * Routes that call `const session = await auth()` continue to work unchanged.
 */
export async function auth() {
  return getServerSession(authOptions);
}
