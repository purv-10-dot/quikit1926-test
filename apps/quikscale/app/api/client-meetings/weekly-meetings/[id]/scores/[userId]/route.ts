import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { updateMemberScoreSchema } from "@/lib/schemas/clientMeetingsSchema";

const withTenantAuth = withTenantAuthForModule("clientMeetings.weeklyMeeting");

/**
 * PATCH /api/client-meetings/weekly-meetings/[id]/scores/[userId]
 * Upserts one member's scores. Used by the per-row "Update" button in
 * the Update tab (image 1).
 */
export const PATCH = withTenantAuth<{ id: string; userId: string }>(
  async ({ tenantId, userId: actorId }, request, { params }) => {
    const parsed = updateMemberScoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 }
      );
    }

    const meeting = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json(
        { success: false, error: "Weekly meeting not found" },
        { status: 404 }
      );
    }

    const data = parsed.data;
    const upserted = await db.clientWeeklyMemberScore.upsert({
      where: {
        meetingId_userId: { meetingId: params.id, userId: params.userId },
      },
      create: {
        meetingId: params.id,
        userId: params.userId,
        kpiWeeklyQTD: data.kpiWeeklyQTD ?? 0,
        kpiCoding: data.kpiCoding ?? 0,
        priorityNotes: data.priorityNotes ?? 0,
        priorityStartEndDate: data.priorityStartEndDate ?? 0,
        priorityColor: data.priorityColor ?? 0,
      },
      update: {
        ...(data.kpiWeeklyQTD !== undefined && {
          kpiWeeklyQTD: data.kpiWeeklyQTD,
        }),
        ...(data.kpiCoding !== undefined && { kpiCoding: data.kpiCoding }),
        ...(data.priorityNotes !== undefined && {
          priorityNotes: data.priorityNotes,
        }),
        ...(data.priorityStartEndDate !== undefined && {
          priorityStartEndDate: data.priorityStartEndDate,
        }),
        ...(data.priorityColor !== undefined && {
          priorityColor: data.priorityColor,
        }),
      },
    });

    await db.clientWeeklyMeetingLog.create({
      data: {
        tenantId,
        meetingId: params.id,
        action: "SCORE_UPDATE",
        newValue: JSON.stringify({
          userId: params.userId,
          ...data,
        }),
        changedBy: actorId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: upserted.userId,
        kpiWeeklyQTD: upserted.kpiWeeklyQTD,
        kpiCoding: upserted.kpiCoding,
        priorityNotes: upserted.priorityNotes,
        priorityStartEndDate: upserted.priorityStartEndDate,
        priorityColor: upserted.priorityColor,
      },
    });
  }
);
