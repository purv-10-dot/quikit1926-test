import { db as prisma } from "@quikit/database";
import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { assertMembership } from "@/lib/authz";
import { getEffectiveLastSeen } from "@/lib/server/presence.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/channels/[id]/last-seen → { lastSeen: string | null }
 *
 * The DM peer's effective last-seen instant. `null` covers every "don't show it"
 * case — mutual opt-out, the peer's `appear_offline`, never recorded, Redis down —
 * and the response deliberately does NOT say which, because distinguishing them
 * would leak the peer's privacy setting.
 *
 * Authorized by CHANNEL MEMBERSHIP, the same rule every other channel sub-route
 * uses, rather than a bespoke "may I see this user" check: if you're in the DM,
 * you're allowed to ask about the person on the other side of it. 403 otherwise,
 * including cross-org (assertMembership rejects a channel outside the org).
 */
export const GET = withOrgAuth(async (_req, ctx, params) => {
  const channelId = params.id!;
  await assertMembership(ctx.orgId, channelId, ctx.userId);

  const channel = await prisma.qcChannel.findUnique({
    where: { id: channelId },
    select: { type: true },
  });
  // Last seen is a 1:1 readout. A group has no single "other side".
  if (channel?.type !== "dm") {
    throw new HttpError(400, "last-seen applies to direct messages only");
  }

  const peers = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId, userId: { not: ctx.userId } },
    select: { userId: true },
  });
  const peerId = peers[0]?.userId;

  return Response.json({
    lastSeen: peerId ? await getEffectiveLastSeen(ctx, peerId) : null,
  });
});
