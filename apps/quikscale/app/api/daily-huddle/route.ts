import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


// GET /api/daily-huddle
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const items = await db.dailyHuddle.findMany({
      where: { tenantId },
      orderBy: { meetingDate: "desc" },
    });

    const result = items.map(item => ({
      ...item,
      meetingDate: item.meetingDate.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch daily huddles";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/daily-huddle
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const body = await request.json();
    const {
      meetingDate, callStatus, clientName, absentMembers,
      actualStartTime, actualEndTime,
      yesterdaysAchievements, stuckIssues, todaysPriority,
      notesKPDashboard, otherNotes,
    } = body;

    if (!meetingDate) return NextResponse.json({ success: false, error: "Meeting date is required" }, { status: 400 });
    if (!callStatus)  return NextResponse.json({ success: false, error: "Call status is required" }, { status: 400 });

    const item = await db.dailyHuddle.create({
      data: {
        tenantId,
        meetingDate: new Date(meetingDate),
        callStatus,
        clientName: clientName?.trim() || null,
        absentMembers: absentMembers?.trim() || null,
        actualStartTime: actualStartTime || null,
        actualEndTime: actualEndTime || null,
        yesterdaysAchievements: !!yesterdaysAchievements,
        stuckIssues: !!stuckIssues,
        todaysPriority: !!todaysPriority,
        notesKPDashboard: notesKPDashboard || null,
        otherNotes: otherNotes || null,
        createdBy: session.user.id,
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
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create daily huddle";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
