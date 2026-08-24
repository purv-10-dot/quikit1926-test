import { NextResponse } from "next/server";
import { z } from "zod";

import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { prepareTranscript, PrepareError } from "@/lib/meetings/prepareTranscript";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/transcripts/[id]/chunk-plan
 *
 * The chunk plan for a transcript: how it would be split, what each chunk
 * costs, and how much of the meeting is covered — **computed without writing
 * anything and without calling a model**.
 *
 * This is the Phase 1 deliverable in one endpoint. Point it at any transcript,
 * including a 6-hour Weekly Meeting, and it answers "what will extraction
 * actually do, and what will it cost?" before a single token is spent.
 *
 * It also makes today's defect visible and measurable: `lib/ai/meetingReport.ts`
 * truncates at `RAW_TEXT_CAP = 60_000` characters — about 65 minutes of speech —
 * so a 4-hour meeting currently loses roughly three quarters of its content with
 * no marker in the output. Compare `contentTokens` here against that cap to see
 * exactly how much is being dropped for a given meeting.
 *
 * Read-only and side-effect free: `dryRun` is forced, so no run, segments or
 * chunks are persisted. Use `POST .../prepare` to persist.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.2, §D.3.
 */
const querySchema = z.object({
  softTargetTokens: z.coerce.number().int().min(500).max(100_000).optional(),
  hardMaxTokens: z.coerce.number().int().min(500).max(200_000).optional(),
  overlapMs: z.coerce.number().int().min(0).max(600_000).optional(),
  chairSpeaker: z.string().min(1).max(120).optional(),
});

/** `2:05:31` — readable window bounds for the plan table. */
function hhmmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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

    try {
      const plan = await prepareTranscript(orgId, params.id, {
        ...parsed.data,
        dryRun: true,
      });

      return NextResponse.json({
        success: true,
        data: {
          transcriptId: params.id,
          idempotencyKey: plan.idempotencyKey,
          summary: {
            segments: plan.segmentCount,
            chunks: plan.chunkCount,
            contentTokens: plan.contentTokens,
            promptTokens: plan.promptTokens,
            overlapOverheadPct: plan.overlapOverheadPct,
            durationMs: plan.contentMs,
            duration: hhmmss(plan.contentMs),
            timingSource: plan.timingSource,
            degraded: plan.degraded,
          },
          normalization: plan.normalization,
          chunks: plan.chunks.map((c) => ({
            ...c,
            window: `${hhmmss(c.startMs)}–${hhmmss(c.endMs)}`,
          })),
        },
      });
    } catch (err) {
      return handlePrepareError(err);
    }
  },
  { fallbackErrorMessage: "Failed to plan transcript chunks" },
);

export function handlePrepareError(err: unknown): NextResponse {
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
