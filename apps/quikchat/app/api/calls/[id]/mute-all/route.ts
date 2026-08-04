import { withOrgAuth } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { getSFUProvider, selectSFUMode } from "@/lib/server/calling/sfu-provider";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/:id/mute-all — host mutes every OTHER participant's
 * microphone. Host = the call's initiator.
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

  const call = await prisma.qcCall.findUnique({ where: { id: callId } });
  if (!call || call.orgId !== ctx.orgId) {
    return Response.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.initiatorId !== ctx.userId) {
    return Response.json({ error: "Only the host can mute all participants" }, { status: 403 });
  }

  const roomId = `call-${call.id}`;
  await getSFUProvider().muteAllParticipants(roomId, ctx.userId);

  return Response.json({ ok: true });
}, { moduleKey: "calls" });
