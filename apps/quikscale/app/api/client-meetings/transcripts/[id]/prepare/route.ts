import { NextResponse } from "next/server";
import { z } from "zod";

import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { prepareTranscript, PrepareError } from "@/lib/meetings/prepareTranscript";

export const runtime = "nodejs";
/**
 * Normalisation and chunk planning are pure string work — a 6-hour transcript
 * is ~1 MB and takes well under a second. The generous ceiling is headroom for
 * the database writes on a very long meeting (~3,000 segments), not for compute.
 */
export const maxDuration = 60;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  /** Re-plan and rewrite even when the idempotency key matches. */
  force: z.boolean().optional(),
  softTargetTokens: z.number().int().min(500).max(100_000).optional(),
  hardMaxTokens: z.number().int().min(500).max(200_000).optional(),
  overlapMs: z.number().int().min(0).max(600_000).optional(),
  chairSpeaker: z.string().min(1).max(120).optional(),
});

/**
 * POST /api/client-meetings/transcripts/[id]/prepare
 *
 * Normalise a transcript into speaker turns, plan its chunks, and persist both
 * under an idempotent extraction run. **Deterministic — no model is called, so
 * this spends nothing.**
 *
 * Idempotent by construction: a second call with the same transcript and the
 * same toolchain versions returns the existing run and rewrites nothing
 * (`reused: true`). Rewriting would be actively harmful — segment ids are the
 * evidence anchors that extracted facts cite, so they must stay stable.
 *
 * PERMISSION — `ClientMeetings.Report: update`, not `view`. Preparation writes
 * segments, chunks and a run row, and can supersede a previous plan. It costs
 * no tokens, but it is unambiguously a write.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.1, §D.8.
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
      const result = await prepareTranscript(orgId, params.id, {
        ...parsed.data,
        requestedBy: userId,
      });

      return NextResponse.json({
        success: true,
        data: {
          runId: result.runId,
          reused: result.reused,
          idempotencyKey: result.idempotencyKey,
          segments: result.segmentCount,
          chunks: result.chunkCount,
          contentTokens: result.contentTokens,
          promptTokens: result.promptTokens,
          overlapOverheadPct: result.overlapOverheadPct,
          durationMs: result.contentMs,
          timingSource: result.timingSource,
          degraded: result.degraded,
          normalization: result.normalization,
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
      throw err;
    }
  },
  { fallbackErrorMessage: "Failed to prepare transcript" },
);
