import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { monthBounds } from "@/lib/reports/monthlyCompose";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const querySchema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be yyyy-mm"),
});

/**
 * GET /api/client-meetings/reports/monthly?clientId=…&period=yyyy-mm
 *
 * Returns the saved Monthly Report, or `report: null` when none exists.
 *
 * **ZERO model calls. ZERO transcript reads.** This is the read path the whole
 * architecture is built around: a month costs ~5k tokens to GENERATE once, and
 * nothing at all to view, however many times it is opened.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` section H.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const bounds = monthBounds(parsed.data.period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const client = await db.client.findFirst({
    where: { id: parsed.data.clientId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const saved = await db.clientMonthlyReport.findFirst({
    where: { orgId, clientId: client.id, periodStart: bounds.start, deletedAt: null },
  });

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  return NextResponse.json({
    success: true,
    data: {
      client,
      period: parsed.data.period,
      report: saved?.report ?? null,
      metrics: saved?.metrics ?? null,
      validation: saved?.validation ?? null,
      confidence: saved?.reportConfidence ?? null,
      generatedAt: saved?.generatedAt ?? null,
      generatedBy: saved?.generatedBy ?? null,
      validatedAt: saved?.validatedAt ?? null,
      validatedBy: saved?.validatedBy ?? null,
      version: saved?.currentVersion ?? null,
      missingWeeks: saved?.missingWeeks ?? [],
      sourceWeeklyReportIds: saved?.sourceWeeklyReportIds ?? [],
      canEdit,
      canGenerate: canEdit,
    },
  });
});
