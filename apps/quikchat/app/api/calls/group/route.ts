import { withOrgAuth } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import * as calling from "@/lib/server/calling/calling.service";
import { selectSFUMode } from "@/lib/server/calling/sfu-provider";
import { userCan, forbidden } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

interface GroupCallInput {
  channelId: string;
  type: "audio" | "video";
  meetingId?: string;
}

/**
 * POST /api/calls/group — create a group call with SFU room and tokens.
 * Creates a QcCall via the service layer (enforces one-call-per-user),
 * creates an SFU room, and generates access tokens for all channel members.
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = (await req.json()) as GroupCallInput;
  const { channelId, type, meetingId } = body;

  if (!channelId || !type || !["audio", "video"].includes(type)) {
    return Response.json(
      { error: "channelId and type (audio|video) are required" },
      { status: 400 },
    );
  }

  // Verify user is a member of the channel
  const membership = await prisma.qcChannelMember.findFirst({
    where: { channelId, userId: ctx.userId },
  });
  if (!membership) {
    return Response.json({ error: "You are not a member of this channel" }, { status: 403 });
  }

  // RBAC v2 gate (Phase 2): starting a group call. Member holds Call.Group:create.
  if (!(await userCan(ctx.userId, ctx.orgId, "Call.Group", "create"))) {
    return forbidden("You do not have permission to start group calls");
  }

  // Fetch all channel members
  const members = await prisma.qcChannelMember.findMany({
    where: { channelId },
  });

  if (members.length < 2) {
    return Response.json(
      { error: "Need at least 2 members to start a group call" },
      { status: 400 },
    );
  }

  const targetUserIds = members.map((m) => m.userId);

  // Create the call via the service layer (enforces one-call-per-user + state machine).
  // Group calls have no ring phase; they start active so the timeout sweep doesn't
  // reap them and one-call-per-user works correctly.
  const call = await calling.createCall(ctx, {
    channelId,
    type,
    targetUserIds,
    meetingId,
    initialStatus: "active",
  });

  // Set up SFU room
  const { mode: sfuMode } = selectSFUMode();
  const roomId = `channel-${channelId}`;
  let sfuRoom: { roomId: string; name: string } | null = null;
  const tokens: Record<string, string> = {};

  try {
    // Dynamically import the SFU provider
    const { getSFUProvider } = await import("@/lib/server/calling/sfu-provider");
    const provider = getSFUProvider();

    sfuRoom = await provider.createRoom(roomId);

    // Generate tokens for all members
    for (const member of members) {
      const token = await provider.generateToken(roomId, member.userId, member.userId);
      tokens[member.userId] = token;
    }
  } catch (e) {
    console.warn("SFU room creation failed, continuing without SFU:", e);
  }

  return Response.json({
    call: {
      id: call.id,
      channelId: call.channelId,
      type: call.type,
      status: call.status,
      participants: call.participants.map((p) => ({
        userId: p.userId,
        state: p.state,
      })),
    },
    sfu: sfuRoom
      ? {
          roomId: sfuRoom.roomId,
          mode: sfuMode,
          tokens,
          livekitUrl: process.env.LIVEKIT_URL ?? null,
        }
      : null,
  });
}, { moduleKey: "calls" });
