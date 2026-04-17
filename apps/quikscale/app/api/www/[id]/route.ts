import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("www");

export const PUT = withTenantAuth<{ id: string }>(
  async ({ tenantId, userId }, request, { params }) => {
    const existing = await db.wWWItem.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }

    const parsed = updateWWWSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const {
      who,
      what,
      when,
      status,
      notes,
      category,
      originalDueDate,
      revisedDates,
    } = parsed.data;

    const updated = await db.wWWItem.update({
      where: { id: params.id },
      data: {
        who: who ?? undefined,
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

    const whoUser = await db.user.findUnique({
      where: { id: updated.who },
      select: { id: true, firstName: true, lastName: true },
    });

    const result = {
      ...updated,
      when: updated.when.toISOString(),
      originalDueDate: updated.originalDueDate?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      who_user: whoUser ?? null,
    };

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "UPDATE",
      entityType: "WWWItem",
      entityId: params.id,
      newValues: updated,
    });

    return NextResponse.json({ success: true, data: result });
  },
  { fallbackErrorMessage: "Failed to update WWW item" },
);

export const DELETE = withTenantAuth<{ id: string }>(
  async ({ tenantId, userId }, _request, { params }) => {
    const existing = await db.wWWItem.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "WWW item not found" },
        { status: 404 },
      );
    }

    // Soft delete
    await db.wWWItem.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await writeAuditLog({
      tenantId,
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
