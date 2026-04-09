import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.wWWItem.findUnique({ where: { id: params.id }, select: { tenantId: true } });
    if (!existing) return NextResponse.json({ success: false, error: "WWW item not found" }, { status: 404 });
    if (existing.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const { who, what, when, status, notes, category, originalDueDate, revisedDates } = body;

    const updated = await db.wWWItem.update({
      where: { id: params.id },
      data: {
        who: who ?? undefined,
        what: what ?? undefined,
        when: when ? new Date(when) : undefined,
        status: status ?? undefined,
        notes: notes !== undefined ? notes : undefined,
        category: category !== undefined ? category : undefined,
        originalDueDate: originalDueDate !== undefined ? (originalDueDate ? new Date(originalDueDate) : null) : undefined,
        revisedDates: revisedDates ?? undefined,
        updatedBy: session.user.id,
      },
    });

    // Attach who_user
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

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update WWW item";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.wWWItem.findUnique({ where: { id: params.id }, select: { tenantId: true } });
    if (!existing) return NextResponse.json({ success: false, error: "WWW item not found" }, { status: 404 });
    if (existing.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    await db.wWWItem.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: "WWW item deleted successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete WWW item";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
