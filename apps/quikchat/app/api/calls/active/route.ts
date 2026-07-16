import { withOrgAuth } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";

export const dynamic = "force-dynamic";

/**
 * GET /api/calls/active — find an active call for the current user (rejoin).
 */
export const GET = withOrgAuth(async (_req, ctx) => {
  const participant = await prisma.qcCallParticipant.findFirst({
    where: {
      userId: ctx.userId,
      call: {
        orgId: ctx.orgId,
        status: { in: ["ringing", "active"] },
      },
    },
    include: {
      call: {
        include: {
          participants: true,
        },
      },
    },
  });

  if (!participant || !participant.call) {
    return Response.json({ call: null });
  }

  const call = participant.call;

  // Resolve channel name if call is in a channel
  let channelName = "Direct call";
  if (call.channelId) {
    const channel = await prisma.qcChannel.findUnique({
      where: { id: call.channelId },
      select: { name: true },
    });
    channelName = channel?.name ?? "Unknown channel";
  }

  return Response.json({
    call: {
      callId: call.id,
      channelId: call.channelId ?? "",
      channelName,
      type: call.type,
      participantCount: call.participants.length,
      startedAt: call.startedAt.toISOString(),
    },
  });
}, { moduleKey: "calls" });
