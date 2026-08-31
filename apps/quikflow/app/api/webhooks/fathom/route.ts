import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret, FATHOM_PROVIDER_ID } from "@/lib/connectors";
import { normalizeMeeting, meetingToEventData, verifyWebhookSignature, withFullDetail } from "@/lib/connectors/fathom";
import { enqueueEvent } from "@/lib/queue/queue";
import { FATHOM_APP_SLUG, FATHOM_EVENT_TRANSCRIBED } from "@/lib/catalog/fathom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/fathom?c=<connectionId> — real-time Fathom webhook.
 *
 * Public (no session): authenticity comes from the Standard-Webhooks (Svix)
 * signature verified against the per-connection signing secret. The connection
 * id in the query resolves the org + secret (Fathom's payload can't name a
 * QuikScale org). On success it enqueues the same `fathom.meeting.transcribed`
 * event the poll scan emits, so both paths converge on one engine flow.
 *
 * Note: on localhost Fathom can't reach this route — the poll scan covers dev.
 * The webhook is the production real-time path.
 */
export async function POST(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get("c");
  if (!connectionId) {
    return NextResponse.json({ success: false, error: "Missing connection id" }, { status: 400 });
  }

  const conn = await db.wfConnection.findFirst({
    where: { id: connectionId, provider: FATHOM_PROVIDER_ID as never, status: "connected" },
    select: { id: true, orgId: true, refreshToken: true, accessToken: true },
  });
  if (!conn) {
    return NextResponse.json({ success: false, error: "Unknown connection" }, { status: 404 });
  }

  const rawBody = await req.text();

  // Verify the Svix-style signature against the stored webhook secret.
  const secret = conn.refreshToken ? decryptSecret(conn.refreshToken) : null;
  if (secret) {
    const ok = verifyWebhookSignature(
      {
        id: req.headers.get("webhook-id"),
        timestamp: req.headers.get("webhook-timestamp"),
        signature: req.headers.get("webhook-signature"),
      },
      rawBody,
      secret,
    );
    if (!ok) return NextResponse.json({ success: false, error: "Bad signature" }, { status: 401 });
  } else if (process.env.FATHOM_WEBHOOK_INSECURE !== "true") {
    // No secret stored and no explicit dev opt-out → refuse (fail closed).
    return NextResponse.json({ success: false, error: "Webhook secret not configured" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const meeting = normalizeMeeting(payload);
  if (!meeting) {
    // Not a meeting event (e.g. a ping) — acknowledge so Fathom doesn't retry.
    return NextResponse.json({ success: true, data: { ignored: true } }, { status: 200 });
  }

  // Fathom's webhook announces that the recording is ready rather than carrying
  // it, so the payload routinely omits the transcript, the summary and the
  // action items. Nothing downstream ever re-read those, so the meeting kept an
  // empty summary FOREVER. Backfill here or the data is lost for good.
  const apiKey = conn.accessToken ? decryptSecret(conn.accessToken) : null;
  const withText = apiKey ? await withFullDetail(apiKey, meeting) : meeting;

  const jobId = await enqueueEvent({
    app: FATHOM_APP_SLUG,
    event: FATHOM_EVENT_TRANSCRIBED,
    orgId: conn.orgId,
    dedupeKey: `fathom:${withText.recordingId}`,
    data: meetingToEventData(withText),
    occurredAt: withText.startedAt ?? undefined,
  });

  return NextResponse.json({ success: true, data: { enqueued: true, jobId } }, { status: 202 });
}
