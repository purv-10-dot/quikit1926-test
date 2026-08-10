import { WebhookReceiver } from "livekit-server-sdk";
import { db as prisma } from "@quikit/database";
import * as calling from "@/lib/server/calling/calling.service";
import { logger } from "@/lib/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/livekit/webhook — LiveKit's server-side event feed. Not gated by
 * withOrgAuth (LiveKit is not one of our users) — authenticity comes from
 * WebhookReceiver's signature check on the `Authorize` header instead.
 * Configure this URL in the LiveKit Cloud dashboard (or self-hosted
 * webhook.urls in the server config).
 *
 * Faster/more reliable than the heartbeat sweep alone for two cases:
 *  - room_finished: the room emptied out (LIVEKIT_URL's emptyTimeout, or an
 *    explicit deleteRoom) without our own PATCH .../end ever firing — e.g. the
 *    browser crashed before pagehide could send it. Idempotent with the normal
 *    end path: calling.endCall/postCallSummary already no-op on an ended call.
 *  - participant_left: for group calls, marks that one participant
 *    disconnected immediately rather than waiting on the heartbeat sweep
 *    (up to ~90s) — the call itself isn't ended by one member leaving.
 */
function getReceiver(): WebhookReceiver | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return new WebhookReceiver(apiKey, apiSecret);
}

/** Room names are `call-<QcCall.id>` (minted in POST /api/calls/:id/token) —
 * this is the only place that parses one back into a callId. */
function callIdFromRoomName(roomName: string | undefined): string | null {
  if (!roomName?.startsWith("call-")) return null;
  return roomName.slice("call-".length);
}

export async function POST(req: Request): Promise<Response> {
  const receiver = getReceiver();
  if (!receiver) {
    logger.warn("LiveKit webhook received but LIVEKIT_API_KEY/LIVEKIT_API_SECRET are unset");
    return Response.json({ error: "LiveKit not configured" }, { status: 503 });
  }

  const body = await req.text();
  const authHeader = req.headers.get("Authorization") ?? undefined;

  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch (e) {
    logger.warn({ error: e }, "LiveKit webhook signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    if (event.event === "room_finished") {
      const callId = callIdFromRoomName(event.room?.name);
      if (callId) {
        const call = await prisma.qcCall.findUnique({ where: { id: callId } });
        // Only "active"/"ringing" need finishing here. A call can already be
        // rejected/missed/timed_out while its room still lingers — e.g. a 1:1
        // caller joins their room immediately on invite, before the callee
        // ever answers — and endCall() would throw on that transition (its
        // state machine only allows ended from active/ringing).
        if (call && (call.status === "active" || call.status === "ringing")) {
          const ctx = { orgId: call.orgId, userId: call.initiatorId };
          await calling.endCall(ctx, callId);
          await calling.postCallSummary(ctx, callId);
        }
      }
    } else if (event.event === "participant_left") {
      const callId = callIdFromRoomName(event.room?.name);
      const identity = event.participant?.identity;
      if (callId && identity) {
        await prisma.qcCallParticipant.updateMany({
          where: { callId, userId: identity, state: { not: "disconnected" } },
          data: { state: "disconnected", leftAt: new Date() },
        });
      }
    }
  } catch (e) {
    // Best-effort: a failure here must not make LiveKit retry forever — the
    // heartbeat sweep is the safety net either way.
    logger.error({ error: e, event: event.event }, "LiveKit webhook handler error");
  }

  return Response.json({ ok: true });
}
