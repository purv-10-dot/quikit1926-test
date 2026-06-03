/**
 * Reconciles a user's `CnUserProjectAccess` rows against a desired list
 * of project IDs. Mirror of `applyModuleRevokes` but for projects —
 * positive grants instead of negative revokes (each row IS the grant).
 *
 * Used by both POST and PATCH on /api/settings/users to keep the
 * project-access table in sync with what the admin ticked in the
 * "Project / Site Assignment" picker.
 *
 * Phase 5: replaces the legacy `cn_users.projectsAssigned` array column.
 * Once nothing reads that column, it can be dropped.
 */

interface ProjectAccessDelegate {
  findMany: (args: unknown) => Promise<Array<{ projectId: string }>>;
  createMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}

interface DbCentralLike {
  cnUserProjectAccess: ProjectAccessDelegate;
}

export interface ApplyProjectAccessResult {
  desired: string[];
  granted: number;
  revoked: number;
}

/**
 * Reconcile `CnUserProjectAccess` rows so the user has exactly the
 * supplied project IDs (no more, no less).
 *
 * @param db central Prisma client (CnUserProjectAccess is in app_quikinfra)
 * @param userId central auth.User.id (NOT cn_users.id)
 * @param orgId tenant scope
 * @param desiredProjectIds the project IDs admin ticked in the form
 * @param actorUserId who triggered the change (for `grantedBy` audit)
 */
export async function applyProjectAccess(
  db: DbCentralLike,
  userId: string,
  orgId: string,
  desiredProjectIds: string[],
  actorUserId: string | null,
): Promise<ApplyProjectAccessResult> {
  // Normalise + dedupe input.
  const desired = Array.from(
    new Set(
      desiredProjectIds.filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      ),
    ),
  );

  // Current rows for this user in this org.
  const current = (await db.cnUserProjectAccess.findMany({
    where: { userId, orgId },
    select: { projectId: true },
  })) as Array<{ projectId: string }>;
  const currentSet = new Set(current.map((r) => r.projectId));
  const desiredSet = new Set(desired);

  // To grant: in desired but not in current.
  const toGrant = desired.filter((p) => !currentSet.has(p));
  // To revoke: in current but not in desired.
  const toRevoke = current
    .map((r) => r.projectId)
    .filter((p) => !desiredSet.has(p));

  let granted = 0;
  let revoked = 0;

  if (toGrant.length > 0) {
    const res = await db.cnUserProjectAccess.createMany({
      data: toGrant.map((projectId) => ({
        userId,
        orgId,
        projectId,
        grantedBy: actorUserId,
      })),
      skipDuplicates: true,
    });
    granted = res.count;
  }

  if (toRevoke.length > 0) {
    const res = await db.cnUserProjectAccess.deleteMany({
      where: {
        userId,
        orgId,
        projectId: { in: toRevoke },
      },
    });
    revoked = res.count;
  }

  return {
    desired,
    granted,
    revoked,
  };
}

/**
 * Load the project IDs a user has access to in the given org.
 * Used by GET /api/settings/users + /api/settings/users/[id] to drive
 * the Edit drawer's "Project / Site Assignment" pre-tick state, and by
 * context.ts to populate `ctx.projectIds` for per-route scoping.
 */
export async function loadProjectAccess(
  db: DbCentralLike,
  userId: string,
  orgId: string,
): Promise<string[]> {
  const rows = (await db.cnUserProjectAccess.findMany({
    where: { userId, orgId },
    select: { projectId: true },
  })) as Array<{ projectId: string }>;
  return rows.map((r) => r.projectId);
}
