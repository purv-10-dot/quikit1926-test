import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


const PRIORITY_SELECT = {
  id: true,
  name: true,
  description: true,
  owner: true,
  teamId: true,
  quarter: true,
  year: true,
  startWeek: true,
  endWeek: true,
  overallStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  tenantId: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  weeklyStatuses: {
    select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true },
    orderBy: { weekNumber: "asc" as const },
  },
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const priority = await db.priority.findUnique({ where: { id: params.id }, select: PRIORITY_SELECT });
    if (!priority) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    if (priority.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    return NextResponse.json({ success: true, data: priority });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch priority";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.priority.findUnique({ where: { id: params.id }, select: { tenantId: true } });
    if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    if (existing.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus, notes } = body;

    const updated = await db.priority.update({
      where: { id: params.id },
      data: {
        name: name ?? undefined,
        description: description ?? null,
        owner: owner ?? undefined,
        teamId: teamId ?? null,
        quarter: quarter ?? undefined,
        year: year ? parseInt(String(year)) : undefined,
        startWeek: startWeek != null ? parseInt(String(startWeek)) : null,
        endWeek: endWeek != null ? parseInt(String(endWeek)) : null,
        overallStatus: overallStatus ?? undefined,
        notes: notes ?? null,
        updatedBy: session.user.id,
      },
      select: PRIORITY_SELECT,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update priority";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.priority.findUnique({ where: { id: params.id }, select: { tenantId: true } });
    if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    if (existing.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    await db.priority.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: "Priority deleted successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete priority";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
