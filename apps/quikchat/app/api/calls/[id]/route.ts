import { withOrgAuth } from "@/lib/auth-shims";
import * as calling from "@/lib/server/calling/calling.service";

export const dynamic = "force-dynamic";

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
