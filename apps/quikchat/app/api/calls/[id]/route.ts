import { withOrgAuth } from "@/lib/auth-shims";
import * as calling from "@/lib/server/calling/calling.service";
import { getSFUProvider, selectSFUMode } from "@/lib/server/calling/sfu-provider";

export const dynamic = "force-dynamic";

/**
 * Delete the LiveKit room for a group call that just ended, rather than
 * waiting on the room's emptyTimeout — bounds billed room-minutes on an
 * already-ended call. 1:1 calls never had a room (pre-Phase-4 mesh); deleteRoom
 * on a nonexistent room is a caught no-op in the live provider, so this stays
 * safe either way. Best-effort: a delete failure must never fail the PATCH.
 */
async function cleanupSFURoom(call: { id: string; participants: { userId: string }[] }): Promise<void> {
  const isGroup = call.participants.length !== 2;
  if (!isGroup) return;
  if (selectSFUMode().mode !== "live") return;
  try {
    await getSFUProvider().deleteRoom(`call-${call.id}`);
  } catch {
    // Best-effort — the room's emptyTimeout is the safety net.
  }
}

/**
 * PATCH /api/calls/:id — update call status (accept, reject, end)
 */
export const PATCH = withOrgAuth(async (req, ctx, params) => {
  const callId = params.id;
  if (!callId) {
    return Response.json({ error: "call id is required" }, { status: 400 });
  }

  const body = await req.json();
  const { action } = body as { action?: "accept" | "reject" | "end" | "timeout" | "heartbeat" };

  if (!action || !["accept", "reject", "end", "timeout", "heartbeat"].includes(action)) {
    return Response.json(
      { error: "action must be 'accept', 'reject', 'end', 'timeout', or 'heartbeat'" },
      { status: 400 },
    );
  }

  let call;
  switch (action) {
    case "accept":
      call = await calling.acceptCall(ctx, callId);
      break;
    case "reject":
      call = await calling.rejectCall(ctx, callId);
      break;
    case "end":
      call = await calling.endCall(ctx, callId);
      // Post call summary message after ending
      await calling.postCallSummary(ctx, callId);
      await cleanupSFURoom(call);
      break;
    case "timeout":
      call = await calling.markMissed(ctx, callId);
      // Post call summary for missed calls
      await calling.postCallSummary(ctx, callId);
      break;
    case "heartbeat":
      call = await calling.recordHeartbeat(ctx, callId);
      break;
  }

  return Response.json(call);
}, { moduleKey: "calls" });
