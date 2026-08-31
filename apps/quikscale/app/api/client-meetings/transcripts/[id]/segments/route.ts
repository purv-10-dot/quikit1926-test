import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** Hard ceiling per request — a 6-hour meeting is ~3,000 segments. */
const MAX_LIMIT = 500;

const querySchema = z.object({
  /** Inclusive segment-index window. */
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(200),
  /** Restrict to one chunk's range — how the evidence drawer scopes a lookup. */
  chunkIdx: z.coerce.number().int().min(0).optional(),
  runId: z.string().min(1).optional(),
});

/**
 * GET /api/client-meetings/transcripts/[id]/segments?from&to&limit
 *
 * Paged access to a transcript's normalised speaker turns.
 *
 * This is the read side of the evidence anchor: every extracted fact cites
 * `transcriptSegmentIds`, and this resolves those ids back to real text by
 * primary key — no search, no model, no cost. It is what the evidence drawer
 * calls when a reviewer asks "where did this claim come from?".
 *
 * Paged deliberately. A 6-hour meeting normalises to roughly 3,000 segments;
 * returning them all would be a multi-megabyte response for a UI that shows a
 * handful at a time.
 *
 * Every query is scoped by `orgId` AND `transcriptId`, so a segment id from
 * another tenant resolves to nothing rather than to someone else's meeting.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.9, §E.3.
 */
export const GET = auth.view<{ id: string }>(
  async ({ orgId }, req, { params }) => {
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
        { status: 400 },
      );
    }
    const { limit, runId, chunkIdx } = parsed.data;
    let { from, to } = parsed.data;

    // The transcript must exist in THIS org before anything else is read.
    const transcript = await db.clientMeetingTranscript.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, timingSource: true, estTokens: true },
    });
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "Transcript not found" },
        { status: 404 },
      );
    }

    // Resolving a chunk to its range keeps the caller from having to know how
    // chunk boundaries were placed. Overlap is included: it is the context the
    // model actually saw for that chunk.
    if (chunkIdx !== undefined) {
      const chunk = await db.meetingChunk.findFirst({
        where: { orgId, transcriptId: params.id, idx: chunkIdx, ...(runId ? { runId } : {}) },
        select: { segFromIdx: true, segToIdx: true, overlapFromIdx: true },
        orderBy: { createdAt: "desc" },
      });
      if (!chunk) {
        return NextResponse.json(
          { success: false, error: "Chunk not found" },
          { status: 404 },
        );
      }
      from = chunk.overlapFromIdx ?? chunk.segFromIdx;
      to = chunk.segToIdx;
    }

    const where = {
      orgId,
      transcriptId: params.id,
      ...(from !== undefined || to !== undefined
        ? {
            idx: {
              ...(from !== undefined ? { gte: from } : {}),
              ...(to !== undefined ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.meetingTranscriptSegment.count({ where }),
      db.meetingTranscriptSegment.findMany({
        where,
        orderBy: { idx: "asc" },
        take: limit,
        select: {
          id: true,
          idx: true,
          startMs: true,
          endMs: true,
          speakerRaw: true,
          clientMemberId: true,
          text: true,
          estTokens: true,
          timingInterpolated: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        transcriptId: params.id,
        /**
         * Provenance of the timings below. `INTERPOLATED` means the ingestion
         * path discarded the recorder's timestamps and these were derived —
         * a consumer showing them as measured times would be misleading.
         */
        timingSource: transcript.timingSource,
        total,
        returned: rows.length,
        hasMore: rows.length === limit && total > rows.length,
        nextFrom: rows.length > 0 ? rows[rows.length - 1].idx + 1 : null,
        segments: rows,
      },
    });
  },
  { fallbackErrorMessage: "Failed to load transcript segments" },
);
