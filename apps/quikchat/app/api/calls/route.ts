import { withOrgAuth } from "@/lib/auth-shims";
import * as calling from "@/lib/server/calling/calling.service";

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

  const call = await calling.createCall(ctx, { channelId, meetingId, type, targetUserIds });
  return Response.json(call, { status: 201 });
});
