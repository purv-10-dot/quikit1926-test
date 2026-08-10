import { withOrgAuth } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { getSFUProvider, selectSFUMode } from "@/lib/server/calling/sfu-provider";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/calls/:id/participants/:identity — host-only participant
 * management (mute/unmute/remove) for a LiveKit call. Host = the call's
 * initiator, matching the roomAdmin grant minted in POST /api/calls/:id/token
 * — anyone else holding a non-admin token would have this rejected by LiveKit
 * itself even if they bypassed this check, but the 403 here gives a clean
 * error instead of a raw SFU failure.
 */
export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const callId = params.id;
  const identity = params.identity;
  if (!callId || !identity) {
    return Response.json({ error: "call id and identity are required" }, { status: 400 });
  }

  const body = await req.json();
  const { action } = body as { action?: "mute" | "unmute" | "remove" };
  if (!action || !["mute", "unmute", "remove"].includes(action)) {
    return Response.json(
      { error: "action must be 'mute', 'unmute', or 'remove'" },
      { status: 400 },
    );
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

  if (call.initiatorId !== ctx.userId) {
    return Response.json({ error: "Only the host can manage participants" }, { status: 403 });
  }

  if (identity === ctx.userId) {
    return Response.json({ error: "Cannot target yourself" }, { status: 400 });
  }

  if (!call.participants.some((p) => p.userId === identity)) {
    return Response.json({ error: "Not a participant of this call" }, { status: 400 });
  }

  const roomId = `call-${call.id}`;
  const provider = getSFUProvider();

  if (action === "remove") {
    await provider.removeParticipant(roomId, identity);
  } else {
    await provider.muteParticipant(roomId, identity, action === "mute");
  }

  return Response.json({ ok: true });
}, { moduleKey: "calls" });
