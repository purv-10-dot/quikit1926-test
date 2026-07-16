import { withOrgAuth } from "@/lib/auth-shims";
import * as calling from "@/lib/server/calling/calling.service";
import { userCan, forbidden } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls — create a new call
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json();
  const { channelId, meetingId, type, targetUserIds } = body as {
    channelId?: string;
    meetingId?: string;
    type?: "audio" | "video";
    targetUserIds?: string[];
  };

  if (!type || !["audio", "video"].includes(type)) {
    return Response.json({ error: "type must be 'audio' or 'video'" }, { status: 400 });
  }
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    return Response.json({ error: "targetUserIds is required" }, { status: 400 });
  }

  // RBAC v2 gate (Phase 2): starting a call. Member holds Call:create; Guest does not.
  if (!(await userCan(ctx.userId, ctx.orgId, "Call", "create"))) {
    return forbidden("You do not have permission to start calls");
  }

  const call = await calling.createCall(ctx, { channelId, meetingId, type, targetUserIds });
  return Response.json(call, { status: 201 });
}, { moduleKey: "calls" });
