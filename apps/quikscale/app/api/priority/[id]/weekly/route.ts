import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyStatusSchema } from "@/lib/schemas/prioritySchema";
import {
  getPastWeekFlags,
  getCurrentFiscalWeekFromDB,
} from "@/lib/utils/featureFlags";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("priority");

// POST /api/priority/[id]/weekly — upsert a weekly status
export const POST = withTenantAuth<{ id: string }>(
  async ({ tenantId, userId }, request, { params }) => {
    const priority = await db.priority.findFirst({
      where: { id: params.id, tenantId },
      select: { quarter: true, year: true },
    });
    if (!priority) {
      return NextResponse.json(
        { success: false, error: "Priority not found" },
        { status: 404 },
      );
    }

    const parsed = weeklyStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const { weekNumber, status, notes } = parsed.data;

    // ── Past-week edit enforcement ──
    const { canEditPastWeek } = await getPastWeekFlags(tenantId);
    if (!canEditPastWeek && priority.quarter && priority.year) {
      const currentWeek = await getCurrentFiscalWeekFromDB(
        tenantId,
        priority.year,
        priority.quarter,
      );
      if (weekNumber < currentWeek) {
        return NextResponse.json(
          {
            success: false,
            error: `Editing past weeks is disabled. Week ${weekNumber} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
          },
          { status: 403 },
        );
      }
    }

    const record = await db.priorityWeeklyStatus.upsert({
      where: {
        priorityId_weekNumber: { priorityId: params.id, weekNumber },
      },
      update: {
        status: String(status),
        notes: notes ?? null,
        updatedBy: userId,
      },
      create: {
        priorityId: params.id,
        weekNumber,
        status: String(status),
        notes: notes ?? null,
        updatedBy: userId,
      },
      select: {
        id: true,
        priorityId: true,
        weekNumber: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: record });
  },
  { fallbackErrorMessage: "Failed to update weekly status" },
);
