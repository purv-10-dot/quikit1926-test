import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings.dailyHuddle");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { validationError } from "@/lib/api/validationError";
import { createHuddleSchema } from "@/lib/schemas/huddleSchema";

// GET /api/daily-huddle
export const GET = withTenantAuth(async ({ tenantId }, request) => {
  const { page, limit, skip, take } = parsePagination(request);
  const where = { tenantId };

  const [items, total] = await Promise.all([
    db.dailyHuddle.findMany({
      where,
      orderBy: { meetingDate: "desc" },
      skip,
      take,
    }),
    db.dailyHuddle.count({ where }),
  ]);

  const result = items.map(item => ({
    ...item,
    meetingDate: item.meetingDate.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return NextResponse.json(paginatedResponse(result, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch daily huddles" });

// POST /api/daily-huddle
export const POST = withTenantAuth(async ({ tenantId, userId }, request) => {
  const parsed = createHuddleSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const {
    meetingDate, callStatus, clientName, absentMembers,
    actualStartTime, actualEndTime,
    yesterdaysAchievements, stuckIssues, todaysPriority,
    notesKPDashboard, otherNotes,
  } = parsed.data;

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
      createdBy: userId,
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
}, { fallbackErrorMessage: "Failed to create daily huddle" });
