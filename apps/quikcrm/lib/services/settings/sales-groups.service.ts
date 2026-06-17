/**
 * Settings → Sales Groups service.
 *
 * CrmSalesGroup is the ACL layer: record visibility is determined by
 * which groups a user belongs to or manages, and which accounts are
 * assigned to those groups.
 *
 * Enhanced in the enterprise hierarchy:
 *   • teamId  — links a group to its parent CrmSalesTeam (management layer)
 *   • description — optional display text
 *
 * REQUIRES MIGRATION for teamId / description columns:
 *   docs/migrations/20260610_enterprise_team_hierarchy.sql
 *   — createGroup / updateGroup write these columns via raw SQL if present,
 *     falling back silently if the columns don't exist yet.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { SettingsConflictError } from "@/lib/services/settings/users.service";
import type { SessionUser } from "@/types/permission";

const MODULE = "sales_groups";

// ─── List / Get ───────────────────────────────────────────────────────────────

export async function listGroups(orgId: string) {
  return prisma.crmSalesGroup.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { members: true, managers: true, accounts: true } },
    },
  });
}

export async function getGroup(orgId: string, id: string) {
  const group = await prisma.crmSalesGroup.findFirst({
    where: { id, orgId },
    include: {
      members: true,
      managers: true,
      accounts: { include: { account: { select: { id: true, name: true } } } },
    },
  });
  if (!group) return null;

  const userIds = [
    ...new Set([
      ...group.members.map((m) => m.userId),
      ...group.managers.map((m) => m.userId),
    ]),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Resolve teamId via raw SQL (may not be in Prisma schema yet)
  const teamRow = await prisma.$queryRaw<{ teamId: string | null }[]>(
    Prisma.sql`SELECT "teamId" FROM app_quikcrm."CrmSalesGroup" WHERE "id" = ${id}`,
  ).catch(() => [{ teamId: null }]);
  const teamId = teamRow[0]?.teamId ?? null;

  // Resolve parent team name if teamId is set
  let team: { id: string; name: string } | null = null;
  if (teamId) {
    team = await prisma.crmSalesTeam
      .findFirst({ where: { id: teamId }, select: { id: true, name: true } })
      .catch(() => null);
  }

  return {
    ...group,
    teamId,
    team,
    members: group.members.map((m) => ({ ...m, user: userById.get(m.userId) ?? null })),
    managers: group.managers.map((m) => ({ ...m, user: userById.get(m.userId) ?? null })),
  };
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createGroup(opts: {
  actor: SessionUser;
  data: { name: string; description?: string | null; teamId?: string | null };
}) {
  const { actor, data } = opts;
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.crmSalesGroup.findFirst({
      where: { orgId: actor.orgId, name: data.name },
    });
    if (dupe) throw new SettingsConflictError(`Sales group "${data.name}" already exists`);

    // Validate teamId belongs to this org
    if (data.teamId) {
      const team = await tx.crmSalesTeam.findFirst({
        where: { id: data.teamId, orgId: actor.orgId },
      });
      if (!team) throw new SettingsConflictError("Team not found in this org", 404);
    }

    const created = await tx.crmSalesGroup.create({
      data: { orgId: actor.orgId, name: data.name },
    });

    // Write teamId / description via raw SQL (columns added by migration)
    if (data.teamId || data.description) {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE app_quikcrm."CrmSalesGroup"
          SET "teamId"      = ${data.teamId ?? null},
              "description" = ${data.description ?? null}
          WHERE "id" = ${created.id}
        `,
      ).catch(() => {/* migration not yet applied */});
    }

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "create",
        resourceId: created.id,
        after: { ...created, teamId: data.teamId ?? null },
      },
      tx,
    );
    return created;
  });
}

export async function updateGroup(opts: {
  actor: SessionUser;
  id: string;
  patch: { name?: string; description?: string | null; teamId?: string | null };
}) {
  const { actor, id, patch } = opts;
  return prisma.$transaction(async (tx) => {
    const before = await tx.crmSalesGroup.findFirst({ where: { id, orgId: actor.orgId } });
    if (!before) throw new SettingsConflictError("Sales group not found", 404);

    if (patch.name && patch.name !== before.name) {
      const dupe = await tx.crmSalesGroup.findFirst({
        where: { orgId: actor.orgId, name: patch.name, id: { not: id } },
      });
      if (dupe) throw new SettingsConflictError(`Sales group "${patch.name}" already exists`);
    }

    if (patch.teamId !== undefined && patch.teamId !== null) {
      const team = await tx.crmSalesTeam.findFirst({
        where: { id: patch.teamId, orgId: actor.orgId },
      });
      if (!team) throw new SettingsConflictError("Team not found in this org", 404);
    }

    // Update the Prisma-managed name column
    const nameUpdate = patch.name ? { name: patch.name } : {};
    const updated = await tx.crmSalesGroup.update({ where: { id }, data: nameUpdate });

    // Update migration-added columns via raw SQL
    if (patch.teamId !== undefined || patch.description !== undefined) {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE app_quikcrm."CrmSalesGroup"
          SET "teamId"      = COALESCE(${patch.teamId ?? null}, "teamId"),
              "description" = COALESCE(${patch.description ?? null}, "description")
          WHERE "id" = ${id}
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

export async function deleteGroup(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  return prisma.$transaction(async (tx) => {
    const target = await tx.crmSalesGroup.findFirst({ where: { id, orgId: actor.orgId } });
    if (!target) throw new SettingsConflictError("Sales group not found", 404);
    // Cascade-deletes members/managers/accounts via FK onDelete: Cascade
    await tx.crmSalesGroup.delete({ where: { id } });
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

// ─── Members / Managers ───────────────────────────────────────────────────────

export async function addMembers(opts: {
  actor: SessionUser;
  groupId: string;
  userIds: string[];
  asManager: boolean;
}) {
  const { actor, groupId, userIds, asManager } = opts;
  return prisma.$transaction(async (tx) => {
    const grp = await tx.crmSalesGroup.findFirst({ where: { id: groupId, orgId: actor.orgId } });
    if (!grp) throw new SettingsConflictError("Sales group not found", 404);

    const usersInOrg = await tx.orgMember.count({
      where: { orgId: actor.orgId, userId: { in: userIds }, status: "active" },
    });
    if (usersInOrg !== userIds.length) {
      throw new SettingsConflictError("One or more users are not active in this org");
    }

    if (asManager) {
      await tx.crmSalesGroupManager.createMany({
        data: userIds.map((userId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    } else {
      await tx.crmSalesGroupMember.createMany({
        data: userIds.map((userId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    }

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "add_members",
        resourceId: groupId,
        metadata: { userIds, asManager },
      },
      tx,
    );
  });
}

export async function removeMember(opts: {
  actor: SessionUser;
  groupId: string;
  userId: string;
  asManager: boolean;
}) {
  const { actor, groupId, userId, asManager } = opts;
  return prisma.$transaction(async (tx) => {
    if (asManager) {
      await tx.crmSalesGroupManager.deleteMany({ where: { groupId, userId } });
    } else {
      await tx.crmSalesGroupMember.deleteMany({ where: { groupId, userId } });
    }
    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "remove_member",
        resourceId: groupId,
        metadata: { userId, asManager },
      },
      tx,
    );
  });
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function addAccounts(opts: {
  actor: SessionUser;
  groupId: string;
  accountIds: string[];
}) {
  const { actor, groupId, accountIds } = opts;
  return prisma.$transaction(async (tx) => {
    const grp = await tx.crmSalesGroup.findFirst({ where: { id: groupId, orgId: actor.orgId } });
    if (!grp) throw new SettingsConflictError("Sales group not found", 404);

    const inOrg = await tx.crmAccount.count({
      where: { orgId: actor.orgId, id: { in: accountIds } },
    });
    if (inOrg !== accountIds.length) {
      throw new SettingsConflictError("One or more accounts are not in this org");
    }

    await tx.crmSalesGroupAccount.createMany({
      data: accountIds.map((accountId) => ({ groupId, accountId })),
      skipDuplicates: true,
    });

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "add_accounts",
        resourceId: groupId,
        metadata: { accountIds },
      },
      tx,
    );
  });
}

export async function removeAccount(opts: {
  actor: SessionUser;
  groupId: string;
  accountId: string;
}) {
  const { actor, groupId, accountId } = opts;
  return prisma.$transaction(async (tx) => {
    await tx.crmSalesGroupAccount.deleteMany({ where: { groupId, accountId } });
    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "remove_account",
        resourceId: groupId,
        metadata: { accountId },
      },
      tx,
    );
  });
}
