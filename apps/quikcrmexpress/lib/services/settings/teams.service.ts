import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { SettingsConflictError } from "@/lib/services/settings/users.service";
import type { SessionUser } from "@/types/permission";

const MODULE = "teams";

export async function listTeams(orgId: string) {
  return prisma.qceSalesTeam.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function createTeam(opts: { actor: SessionUser; data: { name: string; managerId?: string | null } }) {
  const { actor, data } = opts;
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.qceSalesTeam.findFirst({ where: { orgId: actor.orgId, name: data.name } });
    if (dupe) throw new SettingsConflictError(`Team "${data.name}" already exists`);
    if (data.managerId) {
      const mgr = await tx.orgMember.findFirst({
        where: { orgId: actor.orgId, userId: data.managerId, status: "active" },
      });
      if (!mgr) throw new SettingsConflictError("Manager user not found in this org");
    }
    const created = await tx.qceSalesTeam.create({
      data: { orgId: actor.orgId, name: data.name, managerId: data.managerId ?? null },
    });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "create", resourceId: created.id, after: created },
      tx,
    );
    return created;
  });
}

export async function updateTeam(opts: { actor: SessionUser; id: string; patch: { name?: string; managerId?: string | null } }) {
  const { actor, id, patch } = opts;
  return prisma.$transaction(async (tx) => {
    const before = await tx.qceSalesTeam.findFirst({ where: { id, orgId: actor.orgId } });
    if (!before) throw new SettingsConflictError("Team not found", 404);
    if (patch.name && patch.name !== before.name) {
      const dupe = await tx.qceSalesTeam.findFirst({ where: { orgId: actor.orgId, name: patch.name, id: { not: id } } });
      if (dupe) throw new SettingsConflictError(`Team "${patch.name}" already exists`);
    }
    if (patch.managerId) {
      const mgr = await tx.orgMember.findFirst({
        where: { orgId: actor.orgId, userId: patch.managerId, status: "active" },
      });
      if (!mgr) throw new SettingsConflictError("Manager user not found in this org");
    }
    const updated = await tx.qceSalesTeam.update({ where: { id }, data: patch });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "update", resourceId: id, before, after: updated },
      tx,
    );
    return updated;
  });
}

export async function deleteTeam(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  return prisma.$transaction(async (tx) => {
    const target = await tx.qceSalesTeam.findFirst({ where: { id, orgId: actor.orgId } });
    if (!target) throw new SettingsConflictError("Team not found", 404);
    await tx.qceSalesTeam.delete({ where: { id } });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "delete", resourceId: id, before: target },
      tx,
    );
  });
}
