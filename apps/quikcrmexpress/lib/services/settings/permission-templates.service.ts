import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { SettingsConflictError } from "@/lib/services/settings/users.service";
import type { SessionUser } from "@/types/permission";
import type { Prisma } from "@prisma/client";

const MODULE = "permission_templates";

export async function listTemplates(orgId: string) {
  return prisma.qcePermissionTemplate.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });
}

export async function getTemplate(orgId: string, id: string) {
  return prisma.qcePermissionTemplate.findFirst({
    where: { id, orgId },
    include: { _count: { select: { users: true } } },
  });
}

export async function createTemplate(opts: {
  actor: SessionUser;
  data: { name: string; matrix: unknown };
}) {
  const { actor, data } = opts;
  return prisma.$transaction(async (tx) => {
    const dupe = await tx.qcePermissionTemplate.findFirst({ where: { orgId: actor.orgId, name: data.name } });
    if (dupe) throw new SettingsConflictError(`A template named "${data.name}" already exists`);

    const created = await tx.qcePermissionTemplate.create({
      data: {
        orgId: actor.orgId,
        name: data.name,
        matrix: data.matrix as Prisma.InputJsonValue,
      },
    });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "create", resourceId: created.id, after: created },
      tx,
    );
    return created;
  });
}

export async function updateTemplate(opts: {
  actor: SessionUser;
  id: string;
  patch: { name?: string; matrix?: unknown };
}) {
  const { actor, id, patch } = opts;
  return prisma.$transaction(async (tx) => {
    const before = await tx.qcePermissionTemplate.findFirst({ where: { id, orgId: actor.orgId } });
    if (!before) throw new SettingsConflictError("Template not found", 404);

    if (patch.name && patch.name !== before.name) {
      const dupe = await tx.qcePermissionTemplate.findFirst({
        where: { orgId: actor.orgId, name: patch.name, id: { not: id } },
      });
      if (dupe) throw new SettingsConflictError(`A template named "${patch.name}" already exists`);
    }

    const updated = await tx.qcePermissionTemplate.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        matrix: patch.matrix === undefined ? undefined : (patch.matrix as Prisma.InputJsonValue),
      },
    });

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "update",
        resourceId: id,
        before: { name: before.name, matrix: before.matrix },
        after: { name: updated.name, matrix: updated.matrix },
      },
      tx,
    );
    return updated;
  });
}

export async function deleteTemplate(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  return prisma.$transaction(async (tx) => {
    const target = await tx.qcePermissionTemplate.findFirst({ where: { id, orgId: actor.orgId } });
    if (!target) throw new SettingsConflictError("Template not found", 404);

    const assignedCount = await tx.qceUserPermissionTemplate.count({ where: { templateId: id } });
    if (assignedCount > 0) {
      throw new SettingsConflictError(
        `Template is assigned to ${assignedCount} user(s). Reassign or unassign before deleting.`,
      );
    }

    await tx.qcePermissionTemplate.delete({ where: { id } });
    await audit(
      { orgId: actor.orgId, userId: actor.userId, module: MODULE, action: "delete", resourceId: id, before: target },
      tx,
    );
  });
}
