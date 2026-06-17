import type { NextAuthOptions } from "next-auth";
import { createOAuthClientOptions } from "@quikit/auth";
// Type augmentation for next-auth's Session/JWT (id/orgId/email/sessionId/...).
import "@quikit/auth/types";

/**
 * QuikHRMS auth — SSO via QuikIT's OAuth2/OIDC IdP.
 *
 * Uses the shared `createOAuthClientOptions` factory, exactly like
 * quikscale/quiktrack/quikinfra. HRMS layers one extra concern onto the
 * factory's `signOut` event: invalidating its process-local auth caches so the
 * session re-check and RBAC don't linger past the cookie.
 *
 * (This was previously inlined to dodge a Prisma major-version clash — the
 * factory imports @quikit/database. Now that HRMS is on the same Prisma 5 as
 * the shared client, the factory is safe to import.)
 */

// Accept the OIDC-conventional alias too (operators sometimes provision the
// IdP base URL under QUIKIT_ISSUER_URL).
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL ?? "";
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID ?? "quikhrms";

// Reject literal-placeholder secret values (e.g. the var NAME pasted as value).
const PLACEHOLDER_VALUES = new Set([
  "QUIKIT_CLIENT_SECRET",
  "your-client-secret",
  "REPLACE_ME",
  "",
]);
const rawSecret = process.env.QUIKIT_CLIENT_SECRET;
const QUIKIT_CLIENT_SECRET =
  rawSecret && !PLACEHOLDER_VALUES.has(rawSecret) ? rawSecret : "";

const base = createOAuthClientOptions({
  quikitUrl: QUIKIT_URL,
  clientId: QUIKIT_CLIENT_ID,
  clientSecret: QUIKIT_CLIENT_SECRET,
  errorPage: "/login",
});

export const authOptions: NextAuthOptions = {
  ...base,
  events: {
    ...base.events,
    async signOut(message) {
      // Shared Redis session revoke (central logout + every sibling app).
      await base.events?.signOut?.(message);

      // HRMS-specific: drop this user's process-local auth caches.
      const token = (message as { token?: { id?: unknown; orgId?: unknown } }).token;
      if (token?.id) {
        try {
          const { invalidateUserAuthCaches } = await import("@/lib/with-auth");
          await invalidateUserAuthCaches(
            String(token.id),
            token.orgId as string | undefined,
          );
        } catch (err) {
          console.error(
            "[auth] signOut cache invalidation failed:",
            (err as Error).message,
          );
        }
      }
    },
  },
};
