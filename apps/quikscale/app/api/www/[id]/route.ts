import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { canEditWWW } from "@/lib/api/wwwPermissions";
import { notifyWWWReassignment } from "@/lib/services/wwwNotifications";
const withOrgAuth = withOrgAuthForModule("www");

export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    // Cast the select-arg to bypass cached Prisma types that may not yet
    // know about `whoIds` (column exists post-migration). The runtime DB
    // call accepts the field regardless.
    const existing = (await db.wWWItem.findFirst({
      where: { id: params.id, orgId },
      select: ({ id: true, createdBy: true, who: true, what: true, whoIds: true } as unknown) as { id: true; createdBy: true; who: true; what: true },
    })) as
      | { id: string; createdBy: string; who: string; what: string; whoIds?: string[] }
      | null;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }

    // Permission: creator, assignee, admin-level role, or super-admin only
    const allowed = await canEditWWW(userId, orgId, {
      createdBy: existing.createdBy,
      who: existing.who,
    });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only the creator, assignee, or an admin can edit this item" },
        { status: 403 },
      );
    }

    const parsed = updateWWWSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const {
      who,
      whoIds,
      what,
      when,
      status,
      notes,
      category,
      originalDueDate,
      revisedDates,
    } = parsed.data;

    // Resolve assignee list when the client sends either field. Always keep
    // `who` mirrored to whoIds[0] so legacy reads / sort / index queries
    // continue to work.
    let nextWho: string | undefined = undefined;
    let nextWhoIds: string[] | undefined = undefined;
    if (whoIds && whoIds.length > 0) {
      nextWhoIds = whoIds;
      nextWho = whoIds[0];
    } else if (who) {
      nextWhoIds = [who];
      nextWho = who;
    }

    const updated = await db.wWWItem.update({
      where: { id: params.id },
      data: {
        who: nextWho ?? undefined,
        ...(nextWhoIds ? ({ whoIds: nextWhoIds } as { whoIds: string[] }) : {}),
        what: what ?? undefined,
        when: when ? new Date(when) : undefined,
        status: status ?? undefined,
        notes: notes !== undefined ? notes : undefined,
        category: category !== undefined ? category : undefined,
        originalDueDate:
          originalDueDate !== undefined
            ? originalDueDate
              ? new Date(originalDueDate)
              : null
            : undefined,
        revisedDates: revisedDates ?? undefined,
        updatedBy: userId,
      } as Parameters<typeof db.wWWItem.update>[0]["data"],
    });

    const finalIds = (updated as unknown as { whoIds?: string[] }).whoIds && (updated as unknown as { whoIds: string[] }).whoIds.length > 0
      ? (updated as unknown as { whoIds: string[] }).whoIds
      : updated.who ? [updated.who] : [];

    const assignees = finalIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: finalIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const whoUser = assignees.find(u => u.id === updated.who) ?? null;

    const result = {
      ...updated,
      whoIds: finalIds,
      when: updated.when.toISOString(),
      originalDueDate: updated.originalDueDate?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      who_user: whoUser,
      who_users: finalIds.map(id => assignees.find(u => u.id === id)).filter(Boolean),
    };

    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "WWWItem",
      entityId: params.id,
      newValues: updated,
    });

    // Reassignment notification: union of (old ∪ new) assignees gets emailed
    // when the assignee list actually changes. notifyWWWReassignment is a
    // no-op when both lists are identical.
    const previousIds = (existing.whoIds && existing.whoIds.length > 0)
      ? existing.whoIds
      : existing.who ? [existing.who] : [];
    notifyWWWReassignment({
      orgId,
      itemId: updated.id,
      what: updated.what,
      updaterUserId: userId,
      oldOwnerIds: previousIds,
      newOwnerIds: finalIds,
    }).catch((err) => {
      console.error("[PUT /api/www/[id]] notifyWWWReassignment failed:", err);
    });

    return NextResponse.json({ success: true, data: result });
  },
  { fallbackErrorMessage: "Failed to update WWW item" },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _request, { params }) => {
    const existing = await db.wWWItem.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, createdBy: true, who: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }

    // Permission: creator, assignee, admin-level role, or super-admin only
    const allowed = await canEditWWW(userId, orgId, {
      createdBy: existing.createdBy,
      who: existing.who,
    });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Only the creator, assignee, or an admin can delete this item" },
        { status: 403 },
      );
    }

    // Soft delete
    await db.wWWItem.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "DELETE",
      entityType: "WWWItem",
      entityId: params.id,
    });

    return NextResponse.json({
      success: true,
      message: "WWW item deleted successfully",
    });
  },
  { fallbackErrorMessage: "Failed to delete WWW item" },
);
