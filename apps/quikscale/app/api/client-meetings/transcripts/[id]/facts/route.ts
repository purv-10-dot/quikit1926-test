import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTranscriptFacts, summariseCoverage } from "@/lib/facts/query";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/transcripts/[id]/facts
 *
 * Everything extracted from one transcript, grouped by fact type, with the
 * merge lineage that produced it.
 *
 * Reads only. **No model is called**, so inspecting what was extracted costs
 * nothing — which is what makes this usable as a review surface rather than
 * something to be careful about opening.
 *
 * The merge audit is included because a consolidated fact is the one most
 * worth questioning: it asserts a recurrence, and a reviewer needs to see
 * which rule decided that and whether a model was involved.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.7, §J.
 */
export const GET = auth.view<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const transcript = await db.clientMeetingTranscript.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        type: true,
        meetingDate: true,
        extractionStatus: true,
        extractedAt: true,
        extractionVersion: true,
        timingSource: true,
      },
    });
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "Transcript not found" },
        { status: 404 },
      );
    }

    const [facts, merges, latestRun] = await Promise.all([
      getTranscriptFacts(orgId, params.id),
      db.meetingFactMerge.findMany({
        where: { orgId, transcriptId: params.id },
        orderBy: { createdAt: "asc" },
      }),
      db.meetingExtractionRun.findFirst({
        where: { orgId, transcriptId: params.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          coveragePct: true,
          chunksTotal: true,
          chunksCompleted: true,
          chunksFailed: true,
          tokensInput: true,
          tokensOutput: true,
          costUsd: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        transcript,
        run: latestRun,
        coverage: summariseCoverage(facts),
        facts,
        merges,
      },
    });
  },
  { fallbackErrorMessage: "Failed to load transcript facts" },
);
