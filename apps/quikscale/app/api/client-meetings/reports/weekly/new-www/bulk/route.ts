import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleWwwExport } from "@/lib/api/wwwExportHandler";
import { toWeekStart, weekEndFor } from "@/lib/services/weeklyHuddleData";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const querySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
});

/**
 * POST /api/client-meetings/reports/weekly/new-www/bulk
 *
 * **Export WWW** — turn the ticked candidates from a week of Daily Huddles into
 * real WWW items.
 *
 * Nothing here writes `WWWItem` directly: each item goes through
 * `POST /api/www` with the caller's session, so the duplicate guard, audit
 * trail, QuikFlow event and assignment notification all apply unchanged.
 *
 * The week is resolved server-side into the set of transcripts it contains, and
 * a candidate from any other meeting is refused. Without that, a factId from
 * another client's huddle would be exportable by anyone who could name it.
 *
 * PERMISSION — `ClientMeetings.Report: update` AND `WWW: create`.
 */
export const POST = auth.update(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));
  const weekEnd = weekEndFor(weekStart);

  const transcripts = await db.clientMeetingTranscript.findMany({
    where: {
      orgId,
      clientId: parsed.data.clientId,
      deletedAt: null,
      meetingDate: { gte: weekStart, lte: weekEnd },
    },
    select: { id: true },
  });

  return handleWwwExport({
    orgId,
    userId,
    req,
    scope: { transcriptIds: transcripts.map((t) => t.id) },
  });
}, { fallbackErrorMessage: "Failed to export the selected WWW items" });
