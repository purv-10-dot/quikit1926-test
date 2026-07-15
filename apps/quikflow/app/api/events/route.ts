import { NextResponse } from "next/server";
import { z } from "zod";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { enqueueEvent } from "@/lib/queue/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/events — the QuikFlow ingress. Source apps (QuikScale, …) POST
 * normalized events here with a service token; matched Live workflows are
 * executed asynchronously by the GroupMQ worker. This route only validates
 * and enqueues (fast, non-blocking for the caller).
 */
const eventSchema = z.object({
  app: z.string().min(1),
  event: z.string().min(1),
  orgId: z.string().min(1),
  dedupeKey: z.string().min(1),
  data: z.record(z.unknown()).default({}),
  occurredAt: z.string().optional(),
});

export const POST = withServiceAuth(async (req) => {
  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid event" },
      { status: 400 },
    );
  }

  const jobId = await enqueueEvent(parsed.data);
  return NextResponse.json({ success: true, data: { enqueued: true, jobId } }, { status: 202 });
});
