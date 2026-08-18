import { db } from "@/lib/db";

/**
 * QuikFlow reuses QuikScale's dynamic-RBAC (v2) role assignments to decide who
 * is an App Admin: a user granted the system "admin" AppRole for the QuikScale
 * app (UserAppRole → AppRole) is a QuikFlow admin too. QuikFlow has no roles of
 * its own seeded yet — flip RBAC_APP_SLUG to "quikflow" once it does. This
 * mirrors QuikScale's own requireAdmin `extraAdminCheck`, so the two apps agree
 * on who is an admin.
 */
const RBAC_APP_SLUG = "quikscale";

// The App id is stable for the process lifetime — resolve once, then cache.
let cachedAppId: string | null = null;

async function rbacAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findFirst({ where: { slug: RBAC_APP_SLUG }, select: { id: true } });
  cachedAppId = app?.id ?? null;
  return cachedAppId;
}

/**
 * True when the user holds the system "admin" AppRole for this org's RBAC app.
 * One indexed lookup (UserAppRole @@index([userId, orgId])); callers short-
 * circuit on the cheap session checks first, so this only runs for non-obvious
 * admins.
 */
export async function isOrgAppAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await rbacAppId();
  if (!appId) return false;
  const grant = await db.userAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return grant !== null;
}
