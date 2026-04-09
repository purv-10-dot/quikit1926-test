import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


// PUT /api/org/quarters/[id] — update start/end dates
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    const body = await request.json();
    const { startDate, endDate } = body;

    const updated = await db.quarterSetting.update({
      where: { id: params.id },
      data: {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate:   endDate   ? new Date(endDate)   : undefined,
      },
    });

    // Resolve user
    const user = await db.user.findUnique({
      where:  { id: updated.createdBy },
      select: { firstName: true, lastName: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id:                updated.id,
        fiscalYear:        updated.fiscalYear,
        quarter:           updated.quarter,
        startDate:         updated.startDate.toISOString(),
        endDate:           updated.endDate.toISOString(),
        createdAt:         updated.createdAt.toISOString(),
        updatedAt:         updated.updatedAt.toISOString(),
        createdBy:         updated.createdBy,
        createdByName:     user ? `${user.firstName} ${user.lastName}` : "—",
        createdByInitials: user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "??",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update quarter";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/org/quarters/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    await db.quarterSetting.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete quarter";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
