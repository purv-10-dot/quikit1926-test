import { db as prisma } from "@quikit/database";
import type { OrgContext, PublicUser } from "@/lib/shared";
import { toPublicUser } from "./helpers";
import { getGuestUserIds } from "@/lib/authz/permissions";

export interface ListOrgUsersOptions {
  /** Name/email search (case-insensitive substring). */
  q?: string;
  /** Exclude the caller from the results (e.g. picking other people). */
  excludeSelf?: boolean;
  /** Exclude users who are already members of this channel. */
  excludeChannelId?: string;
  limit?: number;
}

/**
 * Org-scoped directory: active members of the caller's org, projected to
 * PublicUser. Tenant-isolated — the candidate ids come from this org's
 * OrgMember rows, so users outside `ctx.orgId` can never appear.
 */
export async function listOrgUsers(
  ctx: OrgContext,
  opts: ListOrgUsersOptions = {},
): Promise<PublicUser[]> {
  const memberships = await prisma.orgMember.findMany({
    where: { orgId: ctx.orgId, status: "active" },
    select: { userId: true },
  });
  let ids = memberships.map((m) => m.userId);
  if (opts.excludeSelf) ids = ids.filter((id) => id !== ctx.userId);

  if (opts.excludeChannelId) {
    const channelMembers = await prisma.qcChannelMember.findMany({
      where: { orgId: ctx.orgId, channelId: opts.excludeChannelId },
      select: { userId: true },
    });
    const inChannel = new Set(channelMembers.map((m) => m.userId));
    ids = ids.filter((id) => !inChannel.has(id));
  }

  if (!ids.length) return [];

  const q = opts.q?.trim();
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { firstName: "asc" },
    take: Math.min(opts.limit ?? 25, 50),
  });
  const guestIds = await getGuestUserIds(ctx.orgId, users.map((u) => u.id));
  return users.map((u) => toPublicUser(u, guestIds.has(u.id)));
}
