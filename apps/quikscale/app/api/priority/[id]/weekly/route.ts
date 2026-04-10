import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { getPastWeekFlags, getCurrentFiscalWeekFromDB } from "@/lib/utils/featureFlags";


// POST /api/priority/[id]/weekly — upsert a weekly status
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    // Verify the priority belongs to this tenant
    const priority = await db.priority.findUnique({
      where: { id: params.id },
      select: { tenantId: true, quarter: true, year: true },
    });
    if (!priority) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    if (priority.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const { weekNumber, status, notes } = body;

    if (weekNumber == null || status === undefined) {
      return NextResponse.json({ success: false, error: "weekNumber and status are required" }, { status: 400 });
    }

    const parsedWeek = parseInt(String(weekNumber));

    // ── Past-week edit enforcement ──
    const { canEditPastWeek } = await getPastWeekFlags(tenantId);
    if (!canEditPastWeek && priority.quarter && priority.year) {
      const currentWeek = await getCurrentFiscalWeekFromDB(tenantId, priority.year, priority.quarter);
      if (parsedWeek < currentWeek) {
        return NextResponse.json(
          {
            success: false,
            error: `Editing past weeks is disabled. Week ${parsedWeek} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
          },
          { status: 403 }
        );
      }
    }

    const record = await db.priorityWeeklyStatus.upsert({
      where: { priorityId_weekNumber: { priorityId: params.id, weekNumber: parsedWeek } },
      update: {
        status: String(status),
        notes: notes ?? null,
        updatedBy: session.user.id,
      },
      create: {
        priorityId: params.id,
        weekNumber: parsedWeek,
        status: String(status),
        notes: notes ?? null,
        updatedBy: session.user.id,
      },
      select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update weekly status";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
