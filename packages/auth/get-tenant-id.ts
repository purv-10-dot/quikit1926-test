import { db } from "@quikit/database";
import { getServerSession } from "next-auth";
import { type NextAuthOptions } from "next-auth";
import { getOrSet } from "./cache";

export interface GetOrgIdConfig {
  appSlug?: string;
}

/**
 * Resolves the active orgId for a user.
 *
 * Hot path on every authenticated API call. NextAuth's JWT already carries
 * `session.user.orgId`, but we also defensively re-validate that the
 * membership row is still active (and, if config.appSlug is set, that the
 * user has UserAppAccess for that app). Both lookups are cached for 60s
 * to keep the per-request overhead at ~zero.
 *
 * Cache TTL is intentionally short so revoking access propagates within
 * a minute. For instant revocation, call `invalidate(...)` from the
 * mutation that toggles status.
 */
export function createGetOrgId(authOptions: NextAuthOptions, config: GetOrgIdConfig = {}) {
  return async function getOrgId(userId: string): Promise<string | null> {
    const session = await getServerSession(authOptions);
    const orgId = session?.user?.orgId;

    if (orgId) {
      // Cache the membership re-validation. Stale cached "active" for up to
      // 60s after admin deactivates is acceptable — we trust the JWT for the
      // identity claim and just sanity-check the row exists & is active.
      const ok = await getOrSet<boolean>(
        `membership:${userId}:${orgId}`,
        60,
        async () => {
          const membership = await db.membership.findFirst({
            where: { userId, orgId, status: "active" },
            select: { id: true },
          });
          return !!membership;
        },
      );
      if (!ok) return null;

      // Per-app access gate (only when caller passed appSlug).
      if (config.appSlug) {
        const hasAccess = await getOrSet<boolean>(
          `appAccess:${userId}:${orgId}:${config.appSlug}`,
          60,
          async () => {
            const app = await db.app.findUnique({ where: { slug: config.appSlug }, select: { id: true } });
            if (!app) return true; // unknown app → don't block; upstream will 404
            const access = await db.userAppAccess.findUnique({
              where: { userId_orgId_appId: { userId, orgId, appId: app.id } },
            });
            return !!access;
          },
        );
        if (!hasAccess) return null;
      }

      return orgId;
    }

    // No tenant on session yet — pick the user's first active membership
    // (used during initial onboarding, before org selection). Cached for
    // 60s; rare path.
    return await getOrSet<string | null>(
      `firstActiveTenant:${userId}`,
      60,
      async () => {
        const membership = await db.membership.findFirst({
          where: { userId, status: "active" },
          orderBy: { createdAt: "asc" },
          select: { orgId: true },
        });
        return membership?.orgId ?? null;
      },
    );
  };
}

// Backwards-compat alias for app code that hasn't migrated to createGetOrgId
// yet. Prefer createGetOrgId in new code; this alias is part of the v4
// rename (tenantId → orgId) and will be removed in a future cleanup.
export type GetTenantIdConfig = GetOrgIdConfig;
export const createGetTenantId = createGetOrgId;
