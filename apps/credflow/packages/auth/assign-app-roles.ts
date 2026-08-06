/**
 * Cross-app helper: assign a named AppRole inside each app's per-schema
 * RBAC v2 tables (`app_<slug>.AppRole` / `app_<slug>.UserAppRole`).
 *
 * Used by every invite flow that mints UserAppAccess rows:
 *   - apps/admin/app/api/members/route.ts                (org admin invite)
 *   - apps/quikit/app/api/super/orgs/[id]/members/route.ts (super admin add member)
 *   - apps/auth/app/api/invitations/accept/route.ts        (invitation accept)
 *
 * Apps without RBAC v2 tables in their schema are silently skipped, so this
 * is safe to call for every (user, app) tuple in the invite flow.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const SAFE_SLUG = /^[a-z0-9_-]+$/;

interface RoleAssignment {
  userId: string;
  appId: string;
  /** Optional. Defaults to "Admin" when empty / undefined. */
  roleName?: string;
}

async function appHasRbac(
  db: PrismaClient,
  slug: string,
): Promise<boolean> {
  if (!SAFE_SLUG.test(slug)) return false;
  const schema = `app_${slug}`;
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = ${schema} AND table_name = 'AppRole'
    ) AS "exists";`,
  );
  return Boolean(rows[0]?.exists);
}

async function resolveRoleId(
  db: PrismaClient,
  orgId: string,
  appId: string,
  slug: string,
  roleName: string,
): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "app_${slug}"."AppRole"
      WHERE "orgId" = $1 AND "appId" = $2 AND "name" = $3
      LIMIT 1`,
    orgId, appId, roleName,
  );
  return rows[0]?.id ?? null;
}

/**
 * Insert UserAppRole rows for each assignment. Idempotent via ON CONFLICT.
 *
 * Behavior:
 *   - Apps without app_<slug>.AppRole table → silently skipped
 *   - Empty/missing roleName → defaults to "Admin"
 *   - Role name not found in DB → skipped (tolerant of half-configured apps)
 */
export async function assignAppRoles(
  db: PrismaClient,
  orgId: string,
  assignments: RoleAssignment[],
): Promise<void> {
  if (assignments.length === 0) return;

  const appIds = [...new Set(assignments.map((a) => a.appId))];
  const apps = await db.app.findMany({
    where: { id: { in: appIds } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(apps.map((a) => [a.id, a.slug]));

  for (const { userId, appId, roleName } of assignments) {
    const slug = slugById.get(appId);
    if (!slug || !SAFE_SLUG.test(slug)) continue;
    if (!(await appHasRbac(db, slug))) continue;

    const effective = roleName && roleName.trim() ? roleName : "Admin";
    const roleId = await resolveRoleId(db, orgId, appId, slug, effective);
    if (!roleId) continue;

    await db.$executeRawUnsafe(
      `INSERT INTO "app_${slug}"."UserAppRole"
         ("id","userId","orgId","roleId","assignedAt")
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT ("userId","orgId","roleId") DO NOTHING`,
      randomUUID(), userId, orgId, roleId,
    );
  }
}
