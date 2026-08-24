import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { buildWwwReview, attachMeetingEvidence } from "@/lib/reports/wwwReview";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const querySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeHistoricClosed: z.coerce.boolean().optional(),
});

/**
 * GET /api/client-meetings/transcripts/[id]/www-review
 *
 * What happened to the commitments made in PREVIOUS meetings.
 *
 * Answers the requirement doc's question from the BUSINESS RECORD, not from
 * this meeting's transcript: statuses come from `WWWItem` and
 * `WWWStatusHistory`. Anything the meeting said about an item is attached as
 * an annotation beside the stored status, never as a replacement — so when a
 * coach says an item is done and the record disagrees, the report shows the
 * discrepancy (`closureDisputed`) instead of quietly picking a side.
 *
 * Row-level visibility is enforced via `buildWwwScopeWhere`, the same helper
 * `GET /api/www` uses. Without it this endpoint would be a way to read the
 * whole org's action list through a report. `scopeLimited` tells the UI when a
 * non-admin is seeing only their own items, so the section can say so rather
 * than implying the team committed to this little.
 *
 * **No model is called.**
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` section I.3.
 */
export const GET = auth.view<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
        { status: 400 },
      );
    }

    const transcript = await db.clientMeetingTranscript.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, clientId: true, meetingDate: true, type: true },
    });
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "Transcript not found" },
        { status: 404 },
      );
    }

    // The meeting being reported on. Status "as of" this moment is what the
    // review describes — later transitions are excluded, so the report says
    // what the item looked like at the time rather than what it looks like now.
    const asOf = transcript.meetingDate ?? new Date();

    const review = await buildWwwReview(
      { orgId, userId },
      transcript.clientId,
      asOf,
      {
        periodStart: parsed.data.periodStart
          ? new Date(`${parsed.data.periodStart}T00:00:00.000Z`)
          : undefined,
        periodEnd: parsed.data.periodEnd
          ? new Date(`${parsed.data.periodEnd}T23:59:59.999Z`)
          : undefined,
        includeHistoricClosed: parsed.data.includeHistoricClosed,
      },
    );

    const withEvidence = await attachMeetingEvidence(orgId, params.id, review);

    return NextResponse.json({
      success: true,
      data: {
        transcriptId: params.id,
        clientId: transcript.clientId,
        asOf,
        ...withEvidence,
      },
    });
  },
  { fallbackErrorMessage: "Failed to build the WWW review" },
);
