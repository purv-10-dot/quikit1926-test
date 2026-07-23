import { db as prisma } from "@quikit/database";
import { HttpError } from "./errors";

/**
 * Assert that `userId` may act on `channelId` within `orgId`:
 *   - the channel must belong to `orgId` (cross-tenant access is rejected), AND
 *   - a QcChannelMember row must exist for (orgId, channelId, userId).
 *
 * @throws {HttpError} 403 otherwise.
 */
export async function assertMembership(
  orgId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const channel = await prisma.qcChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.orgId !== orgId) {
    throw new HttpError(403, "Channel not found in this org");
  }
  const member = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId, channelId, userId } },
  });
  if (!member) {
    throw new HttpError(403, "Not a member of this channel");
  }
}
