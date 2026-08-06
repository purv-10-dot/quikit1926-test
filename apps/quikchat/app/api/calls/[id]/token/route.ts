import { withOrgAuth } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { getSFUProvider, selectSFUMode } from "@/lib/server/calling/sfu-provider";
import { displayNameOf } from "@/lib/server/helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/:id/token — mint a LiveKit access token for the CALLER only.
 *
 * The initiator's request to start a call must never hand back another
 * participant's token (that token grants publish/subscribe on their behalf) —
 * each client fetches its own token here after verifying it's a QcCallParticipant.
 * Idempotently ensures the room exists (LiveKit's createRoom is a no-op if the
 * room is already up), so this single seam works whether the call's room was
 * created earlier (group calls, via /api/calls/group) or not yet (future 1:1
 * LiveKit calls).
 */
export const POST = withOrgAuth(async (_req, ctx, params) => {
  const callId = params.id;
  if (!callId) {
    return Response.json({ error: "call id is required" }, { status: 400 });
  }

  const { mode } = selectSFUMode();
  if (mode !== "live") {
    return Response.json({ error: "SFU is not configured" }, { status: 503 });
  }

  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call || call.orgId !== ctx.orgId) {
    return Response.json({ error: "Call not found" }, { status: 404 });
  }

  const participant = call.participants.find((p) => p.userId === ctx.userId);
  if (!participant) {
    return Response.json({ error: "You are not a participant of this call" }, { status: 403 });
  }

  if (call.status !== "active" && call.status !== "ringing") {
    return Response.json({ error: "Call is not active" }, { status: 409 });
  }

  const roomId = `call-${call.id}`;
  const provider = getSFUProvider();
  await provider.createRoom(roomId);

  const isHost = call.initiatorId === ctx.userId;
  const name = await displayNameOf(ctx.userId);
  const token = await provider.generateToken(roomId, ctx.userId, name, { isHost });

  return Response.json({
    roomId,
    token,
    livekitUrl: process.env.LIVEKIT_URL ?? null,
    // 1:1 is decided by participant count, not channelId — a DM call carries a
    // channelId too. Matches the same rule in calling.service.ts's listHistory.
    isGroup: call.participants.length !== 2,
    // The client needs this to know whether to show host controls (mute/remove
    // others) — mirrors the roomAdmin grant baked into the token above.
    isHost,
  });
}, { moduleKey: "calls" });
