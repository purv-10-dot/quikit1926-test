import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { SettingsConflictError } from "@/lib/services/settings/users.service";
import type { SessionUser } from "@/types/permission";

const MODULE = "sales_groups";

export async function listGroups(orgId: string) {
  return prisma.qcfSalesGroup.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { members: true, managers: true, accounts: true } },
    },
  });
}

export async function getGroup(orgId: string, id: string) {
  // Cross-schema relation to public.User isn't declared on the link tables —
  // fetch the user rows in a follow-up query and merge.
  const group = await prisma.qcfSalesGroup.findFirst({
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
  return {
    ...group,
    members: group.members.map((m) => ({ ...m, user: userById.get(m.userId) ?? null })),
    managers: group.managers.map((m) => ({ ...m, user: userById.get(m.userId) ?? null })),
  };
}

export async function createGroup(opts: { actor: SessionUser; data: { name: string } }) {
  const { actor, data } = opts;
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.qcfSalesGroup.findFirst({ where: { orgId: actor.orgId, name: data.name } });
    if (dupe) throw new SettingsConflictError(`Sales group "${data.name}" already exists`);
    const created = await tx.qcfSalesGroup.create({ data: { orgId: actor.orgId, name: data.name } });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "create", resourceId: created.id, after: created },
      tx,
    );
    return created;
  });
}

export async function updateGroup(opts: { actor: SessionUser; id: string; patch: { name?: string } }) {
  const { actor, id, patch } = opts;
  return prisma.$transaction(async (tx) => {
    const before = await tx.qcfSalesGroup.findFirst({ where: { id, orgId: actor.orgId } });
    if (!before) throw new SettingsConflictError("Sales group not found", 404);
    if (patch.name && patch.name !== before.name) {
      const dupe = await tx.qcfSalesGroup.findFirst({
        where: { orgId: actor.orgId, name: patch.name, id: { not: id } },
      });
      if (dupe) throw new SettingsConflictError(`Sales group "${patch.name}" already exists`);
    }
    const updated = await tx.qcfSalesGroup.update({ where: { id }, data: patch });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "update", resourceId: id, before, after: updated },
      tx,
    );
    return updated;
  });
}

export async function deleteGroup(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  return prisma.$transaction(async (tx) => {
    const target = await tx.qcfSalesGroup.findFirst({ where: { id, orgId: actor.orgId } });
    if (!target) throw new SettingsConflictError("Sales group not found", 404);
    // Cascade-deletes members/managers/accounts via FK onDelete: Cascade
    await tx.qcfSalesGroup.delete({ where: { id } });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "delete", resourceId: id, before: target },
      tx,
    );
  });
}

export async function addMembers(opts: {
  actor: SessionUser;
  groupId: string;
  userIds: string[];
  asManager: boolean;
}) {
  const { actor, groupId, userIds, asManager } = opts;
  return prisma.$transaction(async (tx) => {
    const grp = await tx.qcfSalesGroup.findFirst({ where: { id: groupId, orgId: actor.orgId } });
    if (!grp) throw new SettingsConflictError("Sales group not found", 404);
    // Verify all users have an active membership in this tenant.
    const usersInOrg = await tx.orgMember.count({
      where: { orgId: actor.orgId, userId: { in: userIds }, status: "active" },
    });
    if (usersInOrg !== userIds.length) {
      throw new SettingsConflictError("One or more users are not in this org");
    }
    if (asManager) {
      await tx.qcfSalesGroupManager.createMany({
        data: userIds.map((userId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    } else {
      await tx.qcfSalesGroupMember.createMany({
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
      await tx.qcfSalesGroupManager.deleteMany({ where: { groupId, userId } });
    } else {
      await tx.qcfSalesGroupMember.deleteMany({ where: { groupId, userId } });
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

export async function addAccounts(opts: { actor: SessionUser; groupId: string; accountIds: string[] }) {
  const { actor, groupId, accountIds } = opts;
  return prisma.$transaction(async (tx) => {
    const grp = await tx.qcfSalesGroup.findFirst({ where: { id: groupId, orgId: actor.orgId } });
    if (!grp) throw new SettingsConflictError("Sales group not found", 404);
    const inOrg = await tx.qcfAccount.count({ where: { orgId: actor.orgId, id: { in: accountIds } } });
    if (inOrg !== accountIds.length) {
      throw new SettingsConflictError("One or more accounts are not in this org");
    }
    await tx.qcfSalesGroupAccount.createMany({
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

export async function removeAccount(opts: { actor: SessionUser; groupId: string; accountId: string }) {
  const { actor, groupId, accountId } = opts;
  return prisma.$transaction(async (tx) => {
    await tx.qcfSalesGroupAccount.deleteMany({ where: { groupId, accountId } });
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
