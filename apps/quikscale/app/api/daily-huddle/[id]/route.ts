import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings.dailyHuddle");
import { validationError } from "@/lib/api/validationError";
import { updateHuddleSchema } from "@/lib/schemas/huddleSchema";

type RouteParams = { id: string };

// PUT /api/daily-huddle/[id]
export const PUT = withTenantAuth<RouteParams>(async ({ tenantId }, request, { params }) => {
  const existing = await db.dailyHuddle.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const parsed = updateHuddleSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const {
    meetingDate, callStatus, clientName, absentMembers,
    actualStartTime, actualEndTime,
    yesterdaysAchievements, stuckIssues, todaysPriority,
    notesKPDashboard, otherNotes,
  } = parsed.data;

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
}, { fallbackErrorMessage: "Failed to update daily huddle" });

// DELETE /api/daily-huddle/[id]
export const DELETE = withTenantAuth<RouteParams>(async ({ tenantId }, _request, { params }) => {
  const existing = await db.dailyHuddle.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.dailyHuddle.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete daily huddle" });
