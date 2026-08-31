import { NextResponse } from "next/server";
import { z } from "zod";

import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { prepareTranscript, PrepareError } from "@/lib/meetings/prepareTranscript";
import { runExtraction, ExtractionError, MIN_COVERAGE_PCT } from "@/lib/facts/runExtraction";

export const runtime = "nodejs";
/**
 * A Daily Huddle is one chunk and finishes in well under a minute. A long
 * Weekly Meeting is 15–30 chunks and will NOT fit here — that path belongs on
 * the QuikFlow worker (doc 17 §K, P5). Until then `maxChunks` lets a caller
 * make progress in bounded passes rather than hitting the ceiling mid-run.
 */
export const maxDuration = 300;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  /** Re-prepare before extracting, discarding the previous chunk plan. */
  force: z.boolean().optional(),
  /** Re-attempt chunks that previously failed permanently. */
  retryFailed: z.boolean().optional(),
  /** Bound this pass. Remaining chunks stay PENDING for the next call. */
  maxChunks: z.number().int().min(1).max(200).optional(),
});

/**
 * POST /api/client-meetings/transcripts/[id]/extract
 *
 * Prepare (if needed) and extract facts from a transcript.
 *
 * IDEMPOTENT. Preparation is keyed on the transcript plus every toolchain
 * version, so calling this twice on unchanged input reuses the existing run;
 * and within a run, COMPLETED chunks are never re-extracted. Re-running after a
 * partial failure therefore costs only the chunks that actually failed — not
 * the meeting.
 *
 * PARTIAL RESULTS ARE REPORTED, NOT HIDDEN. A chunk that fails permanently
 * lowers coverage rather than failing the run. Coverage is time-weighted, and
 * the response always carries `coveragePct` plus the exact `missingWindows`, so
 * a caller can never mistake an incomplete extraction for a complete one.
 *
 * PERMISSION — `ClientMeetings.Report: update`. This spends money on the model
 * and writes facts that reports are built from.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.5, §D.10, §J.
 */
export const POST = auth.update<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    try {
      // Preparation is deterministic and cheap, and reuses an existing run when
      // nothing has changed — so calling it unconditionally costs nothing and
      // removes a whole class of "extract before prepare" errors.
      const prepared = await prepareTranscript(orgId, params.id, {
        force: parsed.data.force,
        requestedBy: userId,
      });

      if (!prepared.runId) {
        return NextResponse.json(
          { success: false, error: "Transcript could not be prepared" },
          { status: 422 },
        );
      }

      const result = await runExtraction(orgId, prepared.runId, {
        maxChunks: parsed.data.maxChunks,
        retryFailed: parsed.data.retryFailed,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...result,
          reusedPreparation: prepared.reused,
          timingSource: prepared.timingSource,
          minCoveragePct: MIN_COVERAGE_PCT,
          /**
           * A PARTIAL run may still produce a report, but that report names its
           * missing windows and cannot be signed off. A FAILED run produces no
           * report at all — extrapolating over missing content would be worse
           * than reporting nothing.
           */
          reportable: result.status === "COMPLETED" || result.status === "PARTIAL",
        },
      });
    } catch (err) {
      if (err instanceof PrepareError) {
        const status =
          err.code === "NOT_FOUND" ? 404 : err.code === "NO_CONTENT" ? 422 : 500;
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status },
        );
      }
      if (err instanceof ExtractionError) {
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status: err.code === "RUN_NOT_FOUND" ? 404 : 422 },
        );
      }
      throw err;
    }
  },
  { fallbackErrorMessage: "Failed to extract meeting facts" },
);
