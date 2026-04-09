import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


// PUT /api/daily-huddle/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.dailyHuddle.findFirst({ where: { id: params.id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const body = await request.json();
    const {
      meetingDate, callStatus, clientName, absentMembers,
      actualStartTime, actualEndTime,
      yesterdaysAchievements, stuckIssues, todaysPriority,
      notesKPDashboard, otherNotes,
    } = body;

    const item = await db.dailyHuddle.update({
      where: { id: params.id },
      data: {
        meetingDate: meetingDate ? new Date(meetingDate) : undefined,
        callStatus: callStatus || undefined,
        clientName: clientName?.trim() || null,
        absentMembers: absentMembers?.trim() || null,
        actualStartTime: actualStartTime || null,
        actualEndTime: actualEndTime || null,
        yesterdaysAchievements: yesterdaysAchievements !== undefined ? !!yesterdaysAchievements : undefined,
        stuckIssues: stuckIssues !== undefined ? !!stuckIssues : undefined,
        todaysPriority: todaysPriority !== undefined ? !!todaysPriority : undefined,
        notesKPDashboard: notesKPDashboard !== undefined ? (notesKPDashboard || null) : undefined,
        otherNotes: otherNotes !== undefined ? (otherNotes || null) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...item,
        meetingDate: item.meetingDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update daily huddle";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/daily-huddle/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.dailyHuddle.findFirst({ where: { id: params.id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    await db.dailyHuddle.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete daily huddle";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
