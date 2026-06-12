/**
 * Settings → Teams service.
 *
 * Manages CrmSalesTeam (the management/reporting layer).
 * Teams are NOT the ACL layer — CrmSalesGroup controls record visibility.
 *
 * Hierarchy:
 *   CrmSalesTeam
 *     ├── CrmTeamManager  (managers of this team — raw SQL, new table)
 *     ├── CrmTeamMember   (users in this team — raw SQL, new table)
 *     └── CrmSalesGroup[] (groups linked via CrmSalesGroup.teamId — raw SQL)
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 *   before addTeamMember / removeTeamMember / addTeamManager /
 *   removeTeamManager / linkGroup / unlinkGroup can be used.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { SettingsConflictError } from "@/lib/services/settings/users.service";
import type { SessionUser } from "@/types/permission";

const MODULE = "teams";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  teamId: string;
  userId: string;
  addedAt: Date;
}

export interface TeamManagerRow {
  teamId: string;
  userId: string;
  addedAt: Date;
}

export interface TeamView {
  id: string;
  orgId: string;
  name: string;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** All managers of this team (CrmTeamManager rows) */
  managers: { userId: string; user: { id: string; firstName: string; lastName: string; email: string } | null }[];
  /** All members of this team (CrmTeamMember rows) */
  members: { userId: string; user: { id: string; firstName: string; lastName: string; email: string } | null }[];
  /** Sales groups linked to this team */
  groups: { id: string; name: string; memberCount: number; managerCount: number; accountCount: number }[];
}

// ─── List / Get ───────────────────────────────────────────────────────────────

/**
 * List teams for an org.
 *
 * When `userIdFilter` is provided (non-admin users), only teams where the user
 * is a CrmTeamManager, CrmTeamMember, or the legacy CrmSalesTeam.managerId are
 * returned. Admins pass no filter and get all teams.
 *
 * This removes the silent-empty-list bug where non-admins received a 403 that
 * the frontend interpreted as an empty list.
 */
export async function listTeams(orgId: string, userIdFilter?: string) {
  let scopedTeamIds: string[] | undefined;

  if (userIdFilter) {
    const [managerRows, memberRows, legacyTeams] = await Promise.all([
      prisma
        .$queryRaw<{ teamId: string }[]>(
          Prisma.sql`
            SELECT "teamId"
            FROM   app_quikcrm."CrmTeamManager"
            WHERE  "userId" = ${userIdFilter}
          `,
        )
        .catch(() => [] as { teamId: string }[]),
      prisma
        .$queryRaw<{ teamId: string }[]>(
          Prisma.sql`
            SELECT "teamId"
            FROM   app_quikcrm."CrmTeamMember"
            WHERE  "userId" = ${userIdFilter}
          `,
        )
        .catch(() => [] as { teamId: string }[]),
      prisma.crmSalesTeam.findMany({
        where: { orgId, managerId: userIdFilter },
        select: { id: true },
      }),
    ]);

    scopedTeamIds = [
      ...new Set([
        ...managerRows.map((r) => r.teamId),
        ...memberRows.map((r) => r.teamId),
        ...legacyTeams.map((t) => t.id),
      ]),
    ];

    if (scopedTeamIds.length === 0) return [];
  }

  const where = scopedTeamIds
    ? { orgId, id: { in: scopedTeamIds } }
    : { orgId };

  const teams = await prisma.crmSalesTeam.findMany({ where, orderBy: { name: "asc" } });
  if (teams.length === 0) return [];

  const teamIds = teams.map((t) => t.id);

  // Batch-fetch counts from new tables; fall back to 0 if migration not yet applied.
  const [managerCounts, memberCounts, groupCounts] = await Promise.all([
    prisma
      .$queryRaw<{ teamId: string; cnt: number }[]>(
        Prisma.sql`
          SELECT "teamId", COUNT(*)::int AS cnt
          FROM   app_quikcrm."CrmTeamManager"
          WHERE  "teamId" = ANY(${teamIds}::text[])
          GROUP BY "teamId"
        `,
      )
      .catch(() => [] as { teamId: string; cnt: number }[]),
    prisma
      .$queryRaw<{ teamId: string; cnt: number }[]>(
        Prisma.sql`
          SELECT "teamId", COUNT(*)::int AS cnt
          FROM   app_quikcrm."CrmTeamMember"
          WHERE  "teamId" = ANY(${teamIds}::text[])
          GROUP BY "teamId"
        `,
      )
      .catch(() => [] as { teamId: string; cnt: number }[]),
    prisma
      .$queryRaw<{ teamId: string; cnt: number }[]>(
        Prisma.sql`
          SELECT "teamId", COUNT(*)::int AS cnt
          FROM   app_quikcrm."CrmSalesGroup"
          WHERE  "teamId" = ANY(${teamIds}::text[])
            AND  "orgId"  = ${orgId}
          GROUP BY "teamId"
        `,
      )
      .catch(() => [] as { teamId: string; cnt: number }[]),
  ]);

  const mgrMap = new Map(managerCounts.map((r) => [r.teamId, Number(r.cnt)]));
  const memMap = new Map(memberCounts.map((r) => [r.teamId, Number(r.cnt)]));
  const grpMap = new Map(groupCounts.map((r) => [r.teamId, Number(r.cnt)]));

  return teams.map((t) => ({
    ...t,
    _count: {
      managers: mgrMap.get(t.id) ?? 0,
      members: memMap.get(t.id) ?? 0,
      groups: grpMap.get(t.id) ?? 0,
    },
  }));
}

export async function getTeam(orgId: string, id: string): Promise<TeamView | null> {
  const team = await prisma.crmSalesTeam.findFirst({ where: { id, orgId } });
  if (!team) return null;

  // Fetch managers, members, and groups in parallel using raw SQL for new tables
  const [managerRows, memberRows, groupRows] = await Promise.all([
    prisma.$queryRaw<TeamManagerRow[]>(
      Prisma.sql`SELECT "teamId", "userId", "addedAt" FROM app_quikcrm."CrmTeamManager" WHERE "teamId" = ${id}`,
    ).catch(() => [] as TeamManagerRow[]),

    prisma.$queryRaw<TeamMemberRow[]>(
      Prisma.sql`SELECT "teamId", "userId", "addedAt" FROM app_quikcrm."CrmTeamMember" WHERE "teamId" = ${id}`,
    ).catch(() => [] as TeamMemberRow[]),

    prisma.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`SELECT "id", "name" FROM app_quikcrm."CrmSalesGroup" WHERE "teamId" = ${id} AND "orgId" = ${orgId}`,
    ).catch(() => [] as { id: string; name: string }[]),
  ]);

  // Resolve user display names for managers + members
  const allUserIds = [
    ...new Set([
      ...managerRows.map((r) => r.userId),
      ...memberRows.map((r) => r.userId),
    ]),
  ];
  const users = allUserIds.length
    ? await db.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Resolve group counts
  const groupIds = groupRows.map((g) => g.id);
  const [memberCounts, managerCounts, accountCounts] = await Promise.all([
    prisma.crmSalesGroupMember.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds } },
      _count: { _all: true },
    }),
    prisma.crmSalesGroupManager.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds } },
      _count: { _all: true },
    }),
    prisma.crmSalesGroupAccount.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds } },
      _count: { _all: true },
    }),
  ]);

  const mcMap = new Map(memberCounts.map((r) => [r.groupId, r._count._all]));
  const mgMap = new Map(managerCounts.map((r) => [r.groupId, r._count._all]));
  const acMap = new Map(accountCounts.map((r) => [r.groupId, r._count._all]));

  return {
    ...team,
    managers: managerRows.map((r) => ({ userId: r.userId, user: userById.get(r.userId) ?? null })),
    members: memberRows.map((r) => ({ userId: r.userId, user: userById.get(r.userId) ?? null })),
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: mcMap.get(g.id) ?? 0,
      managerCount: mgMap.get(g.id) ?? 0,
      accountCount: acMap.get(g.id) ?? 0,
    })),
  };
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createTeam(opts: {
  actor: SessionUser;
  data: { name: string; managerId?: string | null };
}) {
  const { actor, data } = opts;
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.crmSalesTeam.findFirst({
      where: { orgId: actor.orgId, name: data.name },
    });
    if (dupe) throw new SettingsConflictError(`Team "${data.name}" already exists`);

    if (data.managerId) {
      const mgr = await tx.orgMember.findFirst({
        where: { orgId: actor.orgId, userId: data.managerId, status: "active" },
      });
      if (!mgr) throw new SettingsConflictError("Manager user not found in this org");
    }

    const created = await tx.crmSalesTeam.create({
      data: { orgId: actor.orgId, name: data.name, managerId: data.managerId ?? null },
    });

    // Seed primary manager into CrmTeamManager (raw SQL, graceful if table missing)
    if (data.managerId) {
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO app_quikcrm."CrmTeamManager" ("teamId", "userId")
          VALUES (${created.id}, ${data.managerId})
          ON CONFLICT DO NOTHING
        `,
      ).catch(() => {/* migration not yet applied — skip */});
    }

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "create",
        resourceId: created.id,
        after: created,
      },
      tx,
    );
    return created;
  });
}

export async function updateTeam(opts: {
  actor: SessionUser;
  id: string;
  patch: { name?: string; managerId?: string | null };
}) {
  const { actor, id, patch } = opts;
  return prisma.$transaction(async (tx) => {
    const before = await tx.crmSalesTeam.findFirst({ where: { id, orgId: actor.orgId } });
    if (!before) throw new SettingsConflictError("Team not found", 404);

    if (patch.name && patch.name !== before.name) {
      const dupe = await tx.crmSalesTeam.findFirst({
        where: { orgId: actor.orgId, name: patch.name, id: { not: id } },
      });
      if (dupe) throw new SettingsConflictError(`Team "${patch.name}" already exists`);
    }

    if (patch.managerId !== undefined && patch.managerId !== null) {
      const mgr = await tx.orgMember.findFirst({
        where: { orgId: actor.orgId, userId: patch.managerId, status: "active" },
      });
      if (!mgr) throw new SettingsConflictError("Manager user not found in this org");
    }

    const updated = await tx.crmSalesTeam.update({ where: { id }, data: patch });

    // Keep CrmTeamManager in sync with the primary managerId
    if (patch.managerId !== undefined && patch.managerId !== null) {
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO app_quikcrm."CrmTeamManager" ("teamId", "userId")
          VALUES (${id}, ${patch.managerId})
          ON CONFLICT DO NOTHING
        `,
      ).catch(() => {/* migration not yet applied */});
    }

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "update",
        resourceId: id,
        before,
        after: updated,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteTeam(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  return prisma.$transaction(async (tx) => {
    const target = await tx.crmSalesTeam.findFirst({ where: { id, orgId: actor.orgId } });
    if (!target) throw new SettingsConflictError("Team not found", 404);

    // Unlink any sales groups from this team before deletion
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE app_quikcrm."CrmSalesGroup"
        SET "teamId" = NULL
        WHERE "teamId" = ${id}
      `,
    ).catch(() => {/* migration not yet applied */});

    await tx.crmSalesTeam.delete({ where: { id } });
    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "delete",
        resourceId: id,
        before: target,
      },
      tx,
    );
  });
}

// ─── Team Members ─────────────────────────────────────────────────────────────
// REQUIRES MIGRATION: CrmTeamMember table

export async function addTeamMembers(opts: {
  actor: SessionUser;
  teamId: string;
  userIds: string[];
}) {
  const { actor, teamId, userIds } = opts;

  const team = await prisma.crmSalesTeam.findFirst({
    where: { id: teamId, orgId: actor.orgId },
  });
  if (!team) throw new SettingsConflictError("Team not found", 404);

  const inOrg = await prisma.orgMember.count({
    where: { orgId: actor.orgId, userId: { in: userIds }, status: "active" },
  });
  if (inOrg !== userIds.length) {
    throw new SettingsConflictError("One or more users are not active in this org");
  }

  const values = userIds.map((uid) => `(${escapeStr(teamId)}, ${escapeStr(uid)})`).join(", ");
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO app_quikcrm."CrmTeamMember" ("teamId", "userId")
      SELECT "teamId", "userId" FROM (VALUES ${Prisma.raw(values)}) AS v("teamId", "userId")
      ON CONFLICT DO NOTHING
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "add_members",
    resourceId: teamId,
    metadata: { userIds },
  });
}

export async function removeTeamMember(opts: {
  actor: SessionUser;
  teamId: string;
  userId: string;
}) {
  const { actor, teamId, userId } = opts;

  const team = await prisma.crmSalesTeam.findFirst({
    where: { id: teamId, orgId: actor.orgId },
  });
  if (!team) throw new SettingsConflictError("Team not found", 404);

  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM app_quikcrm."CrmTeamMember"
      WHERE "teamId" = ${teamId} AND "userId" = ${userId}
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "remove_member",
    resourceId: teamId,
    metadata: { userId },
  });
}

// ─── Team Managers ────────────────────────────────────────────────────────────
// REQUIRES MIGRATION: CrmTeamManager table

export async function addTeamManagers(opts: {
  actor: SessionUser;
  teamId: string;
  userIds: string[];
}) {
  const { actor, teamId, userIds } = opts;

  const team = await prisma.crmSalesTeam.findFirst({
    where: { id: teamId, orgId: actor.orgId },
  });
  if (!team) throw new SettingsConflictError("Team not found", 404);

  const inOrg = await prisma.orgMember.count({
    where: { orgId: actor.orgId, userId: { in: userIds }, status: "active" },
  });
  if (inOrg !== userIds.length) {
    throw new SettingsConflictError("One or more users are not active in this org");
  }

  const values = userIds.map((uid) => `(${escapeStr(teamId)}, ${escapeStr(uid)})`).join(", ");
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO app_quikcrm."CrmTeamManager" ("teamId", "userId")
      SELECT "teamId", "userId" FROM (VALUES ${Prisma.raw(values)}) AS v("teamId", "userId")
      ON CONFLICT DO NOTHING
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "add_managers",
    resourceId: teamId,
    metadata: { userIds },
  });
}

export async function removeTeamManager(opts: {
  actor: SessionUser;
  teamId: string;
  userId: string;
}) {
  const { actor, teamId, userId } = opts;

  const team = await prisma.crmSalesTeam.findFirst({
    where: { id: teamId, orgId: actor.orgId },
  });
  if (!team) throw new SettingsConflictError("Team not found", 404);

  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM app_quikcrm."CrmTeamManager"
      WHERE "teamId" = ${teamId} AND "userId" = ${userId}
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "remove_manager",
    resourceId: teamId,
    metadata: { userId },
  });
}

// ─── Team ↔ Sales Group linking ───────────────────────────────────────────────
// REQUIRES MIGRATION: CrmSalesGroup.teamId column

export async function linkGroupToTeam(opts: {
  actor: SessionUser;
  teamId: string;
  groupId: string;
}) {
  const { actor, teamId, groupId } = opts;

  const [team, group] = await Promise.all([
    prisma.crmSalesTeam.findFirst({ where: { id: teamId, orgId: actor.orgId } }),
    prisma.crmSalesGroup.findFirst({ where: { id: groupId, orgId: actor.orgId } }),
  ]);
  if (!team) throw new SettingsConflictError("Team not found", 404);
  if (!group) throw new SettingsConflictError("Sales group not found", 404);

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE app_quikcrm."CrmSalesGroup"
      SET "teamId" = ${teamId}
      WHERE "id" = ${groupId} AND "orgId" = ${actor.orgId}
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "link_group",
    resourceId: teamId,
    metadata: { groupId },
  });
}

export async function unlinkGroupFromTeam(opts: {
  actor: SessionUser;
  teamId: string;
  groupId: string;
}) {
  const { actor, teamId, groupId } = opts;

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE app_quikcrm."CrmSalesGroup"
      SET "teamId" = NULL
      WHERE "id" = ${groupId} AND "teamId" = ${teamId} AND "orgId" = ${actor.orgId}
    `,
  );

  await audit({
    orgId: actor.orgId,
    userId: actor.userId,
    module: MODULE,
    action: "unlink_group",
    resourceId: teamId,
    metadata: { groupId },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Minimal SQL string escaping for use in Prisma.raw() value lists. */
function escapeStr(s: string): string {
  // Single-quote escape only. IDs are cuid/uuid — no backslashes expected.
  return `'${s.replace(/'/g, "''")}'`;
}
