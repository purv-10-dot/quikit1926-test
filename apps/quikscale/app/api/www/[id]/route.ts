import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { canEditWWW, canEditWWWAssignment } from "@/lib/api/wwwPermissions";
import { notifyWWWReassignment } from "@/lib/services/wwwNotifications";
const auth = withOrgAuthForResource("www", "WWW");

// ─── Response-shaping helper ──────────────────────────────────────────────
// who_user / who_users are NOT Prisma relations on WWWItem — they're
// synthesised by the handler from a separate User lookup. The helper here
// only normalises dates and conditionally strips email; the caller is
// responsible for assembling these fields before passing the item in.

interface WWWUserFull {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}
type WWWUserPublic = Omit<WWWUserFull, "email">;

interface RawWWWForShape {
  id: string;
  orgId: string;
  who: string;
  whoIds: string[];
  what: string;
  when: Date;
  originalDueDate: Date | null;
  status: string;
  notes: string | null;
  category: string | null;
  linkedPriorityId: string | null;
  linkedKPIId: string | null;
  revisedDates: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string | null;
  deletedAt: Date | null;
  who_user: WWWUserFull | null;
  who_users: WWWUserFull[];
}

interface ShapedWWWItem {
  id: string;
  orgId: string;
  who: string;
  whoIds: string[];
  what: string;
  when: string;
  originalDueDate: string | null;
  status: string;
  notes: string | null;
  category: string | null;
  linkedPriorityId: string | null;
  linkedKPIId: string | null;
  revisedDates: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
  deletedAt: string | null;
  who_user: WWWUserFull | WWWUserPublic | null;
  who_users: (WWWUserFull | WWWUserPublic)[];
}

type ShapeWWWOptions = { stripEmail: boolean };

function publicUser(u: WWWUserFull): WWWUserPublic {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName };
}

function shapeWWWResponse(item: RawWWWForShape, opts: ShapeWWWOptions): ShapedWWWItem {
  return {
    id: item.id,
    orgId: item.orgId,
    who: item.who,
    whoIds: item.whoIds,
    what: item.what,
    when: item.when.toISOString(),
    originalDueDate: item.originalDueDate ? item.originalDueDate.toISOString() : null,
    status: item.status,
    notes: item.notes,
    category: item.category,
    linkedPriorityId: item.linkedPriorityId,
    linkedKPIId: item.linkedKPIId,
    revisedDates: item.revisedDates,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
    who_user: opts.stripEmail
      ? (item.who_user ? publicUser(item.who_user) : null)
      : item.who_user,
    who_users: opts.stripEmail ? item.who_users.map(publicUser) : item.who_users,
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────

export const GET = auth.view<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const item = (await db.wWWItem.findFirst({
      where: { id: params.id, orgId },
    })) as unknown as
      | (Omit<RawWWWForShape, "whoIds" | "who_user" | "who_users"> & { whoIds?: string[] })
      | null;

    if (!item) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }
    // Defense in depth — findFirst already filters by orgId above, but mirror
    // the explicit cross-tenant 403 used by KPI/Priority summary endpoints.
    if (item.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const finalIds =
      item.whoIds && item.whoIds.length > 0
        ? item.whoIds
        : item.who
          ? [item.who]
          : [];

    const assignees: WWWUserFull[] =
      finalIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: finalIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
    const whoUser = assignees.find((u) => u.id === item.who) ?? null;
    const whoUsers = finalIds
      .map((id) => assignees.find((u) => u.id === id))
      .filter((u): u is WWWUserFull => Boolean(u));

    const raw: RawWWWForShape = { ...item, whoIds: finalIds, who_user: whoUser, who_users: whoUsers };

    return NextResponse.json({
      success: true,
      data: {
        ...shapeWWWResponse(raw, { stripEmail: false }),
        url: `/quikscale/www/${item.id}`,
      },
    });
  },
  { fallbackErrorMessage: "Failed to fetch WWW item" },
);

export const PUT = auth.update<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    // WWWItem currently stores only a single `who`. `whoIds[]` is preserved
    // at the API boundary (request + response) but synthesized from `who`
    // server-side.
    const existing = await db.wWWItem.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, createdBy: true, who: true, what: true, when: true },
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

    // "Who" (assignee) and "When" (due date) are creator-gated: only the
    // creator or an admin/super-admin may change them. Other allowed editors
    // (e.g. the assignee) keep edit rights on the remaining fields. We compare
    // against the stored values — the client always sends who/when in the
    // payload, so we only enforce the stricter gate when they ACTUALLY change.
    // Dates are compared at day granularity (UTC) since the form round-trips a
    // date-only value.
    const whoChanged = nextWho !== undefined && nextWho !== existing.who;
    const toDayUTC = (d: Date) => d.toISOString().slice(0, 10);
    const whenChanged =
      when !== undefined && toDayUTC(new Date(when)) !== toDayUTC(existing.when);
    if (whoChanged || whenChanged) {
      const canChangeAssignment = await canEditWWWAssignment(userId, orgId, {
        createdBy: existing.createdBy,
      });
      if (!canChangeAssignment) {
        return NextResponse.json(
          { success: false, error: "Only the creator or an admin can change Who and When" },
          { status: 403 },
        );
      }
    }

    const updated = await db.wWWItem.update({
      where: { id: params.id },
      data: {
        who: nextWho ?? undefined,
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
      },
    });

    // Synthesize whoIds from the persisted single `who` (resp. from the
    // requested update if it provided a list).
    const finalIds = nextWhoIds ?? (updated.who ? [updated.who] : []);

    const assignees: WWWUserFull[] = finalIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: finalIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const whoUser = assignees.find(u => u.id === updated.who) ?? null;
    const whoUsers = finalIds
      .map((id) => assignees.find((u) => u.id === id))
      .filter((u): u is WWWUserFull => Boolean(u));

    const raw: RawWWWForShape = {
      ...(updated as unknown as Omit<RawWWWForShape, "whoIds" | "who_user" | "who_users">),
      whoIds: finalIds,
      who_user: whoUser,
      who_users: whoUsers,
    };
    const result = shapeWWWResponse(raw, { stripEmail: false });

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
    const previousIds = existing.who ? [existing.who] : [];
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

export const DELETE = auth.delete<{ id: string }>(
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
