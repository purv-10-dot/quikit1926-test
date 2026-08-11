import { randomBytes } from "node:crypto";
import { HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import {
  ASSISTANT_BOT_USER_ID,
  publishFanout,
  type ChannelList,
  type ChannelListItem,
  type ChannelMemberDto,
  type CreateChannelInput,
  type CreateInviteInput,
  type DiscoverChannelItem,
  type InviteDto,
  type InvitePreview,
  type OrgContext,
  type PublicUser,
  type UpdateChannelInput,
} from "@/lib/shared";
import { getStorage } from "@/lib/server/storage";
import { displayNameOf, loadPublicUsers, toMessageDto, type MessageRow } from "./helpers";
import { ensureAssistantBot } from "./assistant.service";
import * as notifications from "./notifications.service";
import { userCan } from "@/lib/authz/permissions";

type ChannelRow = {
  id: string;
  orgId: string;
  type: string;
  visibility: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemberRow = {
  id: string;
  orgId: string;
  channelId: string;
  userId: string;
  role: string;
  isPinned: boolean;
  lastReadAt: Date | null;
  lastDeliveredAt: Date | null;
  joinedAt: Date;
};

type InviteRow = {
  id: string;
  orgId: string;
  channelId: string;
  code: string;
  createdById: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

// ============================================================================
// Membership guards (org-scoped)
// ============================================================================

async function requireMember(ctx: OrgContext, channelId: string): Promise<MemberRow> {
  const member = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: ctx.userId } },
  });
  if (!member) throw new HttpError(403, "Not a member of this channel");
  return member;
}

/**
 * Moderation guard (RBAC v2, DECISION 4). Passes if the caller is a
 * channel-admin (the existing intra-channel role) OR holds the app-level
 * `Channel.Moderate` grant for `action` — making app Moderators/Admins a
 * superset of per-channel admins. `Channel.Moderate` is the org-admin-tunable
 * cell (default-granted to Moderator + Admin). Still requires channel
 * membership first (tenant isolation). Returns the caller's member row.
 */
export async function requireChannelAdminOrModerator(
  ctx: OrgContext,
  channelId: string,
  action: "update" | "delete",
): Promise<MemberRow> {
  const member = await requireMember(ctx, channelId);
  if (member.role === "admin") return member;
  if (await userCan(ctx.userId, ctx.orgId, "Channel.Moderate", action)) return member;
  throw new HttpError(403, "Only admins or moderators can perform this action");
}

async function getChannelOr404(ctx: OrgContext, channelId: string): Promise<ChannelRow> {
  const channel = await prisma.qcChannel.findFirst({ where: { id: channelId, orgId: ctx.orgId } });
  if (!channel) throw new HttpError(404, "Channel not found");
  return channel;
}

// ============================================================================
// Group avatar — stored as an objectPath, resolved to a short-lived signed URL
// on read (mirrors message media / injectMediaUrl). We pass an image
// content-type so the storage driver serves it INLINE (isInlineType → inline).
// ============================================================================

function imageMimeFromPath(objectPath: string): string {
  const ext = objectPath.slice(objectPath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

/** Mint a fresh signed URL for a stored avatar objectPath (best-effort). */
async function signAvatar(objectPath: string): Promise<string | null> {
  try {
    return await getStorage().createDownloadUrl(objectPath, {
      contentType: imageMimeFromPath(objectPath),
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a group channel's stored avatar objectPath to a signed URL. DM/AI
 * items carry a derived member avatar (already a URL) and are left untouched.
 * A failed mint drops the avatar to null → the UI falls back to the group glyph.
 */
async function resolveGroupAvatar(
  item: ChannelListItem,
  channel: ChannelRow,
): Promise<ChannelListItem> {
  if (channel.type !== "group" || !channel.avatarUrl) return item;
  return { ...item, avatarUrl: await signAvatar(channel.avatarUrl) };
}

// ============================================================================
// System messages → persist + publishFanout (Step 5)
// ============================================================================

async function emitSystemMessage(ctx: OrgContext, channelId: string, text: string): Promise<void> {
  const saved = await prisma.qcMessage.create({
    data: {
      orgId: ctx.orgId,
      channelId,
      senderId: ctx.userId,
      type: "SystemActivity",
      content: text,
      data: undefined,
      reactions: {},
    },
  });
  // Publish a FULL MessageDto so the gateway can treat `system` exactly like
  // `message` (no DB access on the gateway for serialization).
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "system",
    payload: toMessageDto(saved as MessageRow, null),
  });
}

/**
 * Tell a channel's remaining members that its ROSTER changed (someone left, was
 * removed, or had their role changed).
 *
 * Deliberately reuses `channel_updated` rather than minting a roster-specific
 * event. The gateway already relays `channel_updated` to the channel room, and
 * `applyChannelUpdated` guards every field with `!== undefined`, so a payload of
 * just `{ channelId }` is a no-op on the cached channel row and carries only the
 * "re-read this channel" signal. A new event type would mean editing BOTH copies
 * of the fan-out contract (`lib/shared/publish.ts` and the gateway's
 * byte-for-byte duplicate `fanout-contract.ts`), the dispatcher, and the client
 * — for an identical result.
 *
 * The client side of this is load-bearing: `onChannelUpdated` in ChatWorkspace
 * must invalidate `["members", channelId]` and `["channels"]`, not just
 * `["channel-detail"]`. Without that, this publish changes nothing on screen —
 * the roster lives in a different query from the channel row.
 *
 * Why it matters: `leave()` posts a "left the chat" system message, which IS
 * fanned out, so remaining members watched someone announce their departure
 * while the member list kept showing them. The two visibly disagreed until a
 * refetch.
 */
async function publishRosterChanged(orgId: string, channelId: string): Promise<void> {
  await publishFanout({
    orgId,
    channelId,
    event: "channel_updated",
    payload: { channelId },
  });
}

// ============================================================================
// Create / discover / join
// ============================================================================

export async function create(ctx: OrgContext, input: CreateChannelInput): Promise<ChannelListItem> {
  const type = input.type;
  if (type !== "dm" && type !== "group") {
    throw new HttpError(400, "type must be 'dm' or 'group'");
  }
  const visibility = input.visibility ?? "private";
  const seedIds = Array.from(new Set([ctx.userId, ...(input.memberIds ?? [])]));

  if (type === "dm") {
    if (seedIds.length !== 2) throw new HttpError(400, "DM must have exactly two members");
    if (visibility === "public") throw new HttpError(400, "DMs cannot be public");
    const existing = await findExistingDm(ctx, seedIds[0]!, seedIds[1]!);
    if (existing) return findById(ctx, existing.id);
  }

  if (type === "group" && visibility === "public" && !input.name?.trim()) {
    throw new HttpError(400, "Public channels must have a name");
  }

  // RBAC v2 gate (Phase 2) — the single creation choke point. Member holds
  // Channel:create + Channel.DM:create by default; Channel.Public:create is the
  // org-admin-tunable cell (DECISION 2, default off for Member).
  if (type === "group") {
    if (!(await userCan(ctx.userId, ctx.orgId, "Channel", "create"))) {
      throw new HttpError(403, "You do not have permission to create channels");
    }
    if (
      visibility === "public" &&
      !(await userCan(ctx.userId, ctx.orgId, "Channel.Public", "create"))
    ) {
      throw new HttpError(403, "You do not have permission to create public channels");
    }
  } else if (type === "dm") {
    if (!(await userCan(ctx.userId, ctx.orgId, "Channel.DM", "create"))) {
      throw new HttpError(403, "You do not have permission to start direct messages");
    }
  }

  const channelId = await prisma.$transaction(async (tx) => {
    const channel = await tx.qcChannel.create({
      data: {
        orgId: ctx.orgId,
        type,
        visibility,
        name: type === "group" ? (input.name ?? "New Group") : null,
        description: input.description?.trim() || null,
        createdById: ctx.userId,
      },
    });
    await tx.qcChannelMember.createMany({
      data: seedIds.map((userId) => ({
        orgId: ctx.orgId,
        channelId: channel.id,
        userId,
        role: userId === ctx.userId ? "admin" : "member",
      })),
    });
    return channel.id;
  });

  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_created",
    payload: { channelId, memberIds: seedIds },
  });

  return findById(ctx, channelId);
}

async function findExistingDm(
  ctx: OrgContext,
  userA: string,
  userB: string,
): Promise<ChannelRow | null> {
  const aRows = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, userId: userA, channel: { type: "dm" } },
    select: { channelId: true },
  });
  if (!aRows.length) return null;
  const ids = aRows.map((r) => r.channelId);
  const bRow = await prisma.qcChannelMember.findFirst({
    where: { orgId: ctx.orgId, userId: userB, channelId: { in: ids } },
  });
  if (!bRow) return null;
  return prisma.qcChannel.findFirst({ where: { id: bRow.channelId, orgId: ctx.orgId } });
}

/**
 * Find the caller's AI-chat singleton, or create it. Deliberately NOT routed
 * through the public `create()` (which only accepts dm/group) so that path's
 * validation stays intact. The channel holds the caller (admin) + the synthetic
 * assistant bot; there is at most one `type:"ai"` channel per user, mirroring
 * the find-or-create spirit of `findExistingDm`.
 */
export async function findOrCreateAiChat(ctx: OrgContext): Promise<ChannelListItem> {
  // RBAC v2 gate (Phase 2) — opening the AI chat IS assistant use, so it gates
  // on Assistant:create, consistent with the assist route. Bars Guests (who
  // hold only Channel:view) from the assistant entirely.
  if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
    throw new HttpError(403, "You do not have permission to use the assistant");
  }
  const existing = await findExistingAiChat(ctx);
  if (existing) return findById(ctx, existing.id);

  const channelId = await prisma.$transaction(async (tx) => {
    const channel = await tx.qcChannel.create({
      data: {
        orgId: ctx.orgId,
        type: "ai",
        visibility: "private",
        name: null, // display name ("AI Chat") is derived in toListItem
        createdById: ctx.userId,
      },
    });
    await tx.qcChannelMember.create({
      data: { orgId: ctx.orgId, channelId: channel.id, userId: ctx.userId, role: "admin" },
    });
    return channel.id;
  });

  // Bot joins as a real member so its replies attribute + serialize. Uses the
  // global client (not the tx) so it runs post-commit — same ordering create()
  // uses for its post-commit publishFanout.
  await ensureAssistantBot(ctx.orgId, channelId);
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_created",
    payload: { channelId, memberIds: [ctx.userId] },
  });

  return findById(ctx, channelId);
}

async function findExistingAiChat(ctx: OrgContext): Promise<ChannelRow | null> {
  const row = await prisma.qcChannelMember.findFirst({
    where: { orgId: ctx.orgId, userId: ctx.userId, channel: { type: "ai" } },
    select: { channelId: true },
  });
  if (!row) return null;
  return prisma.qcChannel.findFirst({ where: { id: row.channelId, orgId: ctx.orgId } });
}

export async function discover(
  ctx: OrgContext,
  query?: string,
  limit = 25,
): Promise<DiscoverChannelItem[]> {
  const q = query?.trim();
  const channels = await prisma.qcChannel.findMany({
    where: {
      orgId: ctx.orgId,
      type: "group",
      visibility: "public",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 100),
  });
  if (!channels.length) return [];

  const ids = channels.map((c) => c.id);
  const memberRows = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId: { in: ids } },
  });
  const counts = new Map<string, number>();
  const myChannels = new Set<string>();
  for (const m of memberRows) {
    counts.set(m.channelId, (counts.get(m.channelId) ?? 0) + 1);
    if (m.userId === ctx.userId) myChannels.add(m.channelId);
  }

  return channels
    .map((c) => ({
      channelId: c.id,
      name: c.name,
      description: c.description,
      avatarUrl: c.avatarUrl,
      memberCount: counts.get(c.id) ?? 0,
      visibility: c.visibility as DiscoverChannelItem["visibility"],
      isMember: myChannels.has(c.id),
    }))
    .sort((a, b) => Number(a.isMember) - Number(b.isMember));
}

export async function join(ctx: OrgContext, channelId: string): Promise<ChannelListItem> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.visibility !== "public" || channel.type !== "group") {
    throw new HttpError(403, "This channel is not joinable");
  }
  const existing = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: ctx.userId } },
  });
  if (existing) return findById(ctx, channelId);

  await prisma.qcChannelMember.create({
    data: { orgId: ctx.orgId, channelId, userId: ctx.userId, role: "member" },
  });
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_created",
    payload: { channelId, memberIds: [ctx.userId] },
  });
  await emitSystemMessage(ctx, channelId, `${await displayNameOf(ctx.userId)} joined the chat`);
  return findById(ctx, channelId);
}

// ============================================================================
// Invites
// ============================================================================

export async function createInvite(
  ctx: OrgContext,
  channelId: string,
  opts: CreateInviteInput = {},
): Promise<InviteDto> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group") throw new HttpError(400, "Only groups can have invite links");
  const member = await requireMember(ctx, channelId);
  if (channel.visibility === "private" && member.role !== "admin") {
    throw new HttpError(403, "Only admins can create invites for private groups");
  }
  if (opts.maxUses != null && opts.maxUses < 1) {
    throw new HttpError(400, "maxUses must be >= 1");
  }
  const expiresAt =
    opts.expiresInMinutes && opts.expiresInMinutes > 0
      ? new Date(Date.now() + opts.expiresInMinutes * 60_000)
      : null;
  const code = randomBytes(8).toString("base64url");

  const invite = await prisma.qcInvite.create({
    data: {
      orgId: ctx.orgId,
      channelId,
      code,
      createdById: ctx.userId,
      maxUses: opts.maxUses ?? null,
      useCount: 0,
      expiresAt,
      revokedAt: null,
    },
  });
  return serializeInvite(invite, channel);
}

export async function listInvites(ctx: OrgContext, channelId: string): Promise<InviteDto[]> {
  await requireMember(ctx, channelId);
  const channel = await getChannelOr404(ctx, channelId);
  const rows = await prisma.qcInvite.findMany({
    where: { orgId: ctx.orgId, channelId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => serializeInvite(r, channel));
}

export async function revokeInvite(
  ctx: OrgContext,
  channelId: string,
  inviteId: string,
): Promise<{ revoked: true }> {
  const member = await requireMember(ctx, channelId);
  const invite = await prisma.qcInvite.findFirst({
    where: { id: inviteId, channelId, orgId: ctx.orgId },
  });
  if (!invite) throw new HttpError(404, "Invite not found");
  if (invite.createdById !== ctx.userId && member.role !== "admin") {
    throw new HttpError(403, "Only the invite creator or an admin can revoke this invite");
  }
  await prisma.qcInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  return { revoked: true };
}

/** Public preview — no org context. The code is the secret. */
export async function previewInvite(code: string): Promise<InvitePreview> {
  const invite = await prisma.qcInvite.findUnique({ where: { code } });
  if (!invite) throw new HttpError(404, "Invite not found");
  assertInviteUsable(invite);
  const channel = await prisma.qcChannel.findUnique({ where: { id: invite.channelId } });
  if (!channel) throw new HttpError(404, "Channel no longer exists");
  const memberCount = await prisma.qcChannelMember.count({
    where: { orgId: invite.orgId, channelId: invite.channelId },
  });
  return {
    channelId: channel.id,
    name: channel.name,
    description: channel.description,
    visibility: channel.visibility as InvitePreview["visibility"],
    memberCount,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    remainingUses: invite.maxUses != null ? invite.maxUses - invite.useCount : null,
  };
}

/**
 * Accept an invite. Atomic member-add + use-count bump in a transaction.
 * Cross-org guard: the invite's org MUST equal the caller's org — otherwise
 * 404 (do not leak the invite's existence to another tenant).
 */
export async function acceptInvite(ctx: OrgContext, code: string): Promise<ChannelListItem> {
  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.qcInvite.findUnique({ where: { code } });
    if (!invite || invite.orgId !== ctx.orgId) throw new HttpError(404, "Invite not found");
    assertInviteUsable(invite);

    const channel = await tx.qcChannel.findFirst({
      where: { id: invite.channelId, orgId: ctx.orgId },
    });
    if (!channel) throw new HttpError(410, "Channel no longer exists");

    const existing = await tx.qcChannelMember.findUnique({
      where: {
        orgId_channelId_userId: {
          orgId: ctx.orgId,
          channelId: invite.channelId,
          userId: ctx.userId,
        },
      },
    });
    if (!existing) {
      await tx.qcChannelMember.create({
        data: { orgId: ctx.orgId, channelId: invite.channelId, userId: ctx.userId, role: "member" },
      });
      // Only burn a use when a NEW member is actually added.
      await tx.qcInvite.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } });
    }
    return { channelId: channel.id, alreadyMember: !!existing };
  });

  if (!result.alreadyMember) {
    await publishFanout({
      orgId: ctx.orgId,
      channelId: result.channelId,
      event: "channel_created",
      payload: { channelId: result.channelId, memberIds: [ctx.userId] },
    });
    await emitSystemMessage(
      ctx,
      result.channelId,
      `${await displayNameOf(ctx.userId)} joined via invite`,
    );
  }
  return findById(ctx, result.channelId);
}

function assertInviteUsable(invite: InviteRow): void {
  if (invite.revokedAt) throw new HttpError(410, "This invite was revoked");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new HttpError(410, "This invite has expired");
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    throw new HttpError(410, "This invite has reached its use limit");
  }
}

function serializeInvite(invite: InviteRow, channel: ChannelRow): InviteDto {
  return {
    id: invite.id,
    code: invite.code,
    channelId: invite.channelId,
    channelName: channel.name,
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString(),
    createdById: invite.createdById,
    revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
  };
}

// ============================================================================
// Listing / detail
// ============================================================================

export async function listForUser(ctx: OrgContext): Promise<ChannelList> {
  const memberships = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, userId: ctx.userId },
  });
  if (!memberships.length) return { priority: [], recent: [] };
  const channelIds = memberships.map((m) => m.channelId);

  const channels = await prisma.qcChannel.findMany({
    where: { orgId: ctx.orgId, id: { in: channelIds } },
    orderBy: { updatedAt: "desc" },
  });
  const allMembers = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId: { in: channelIds } },
  });
  const userMap = await loadPublicUsers(allMembers.map((m) => m.userId));

  const allMessages = await prisma.qcMessage.findMany({
    where: { orgId: ctx.orgId, channelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
  });
  const lastByChannel = new Map<string, MessageRow>();
  const messagesByChannel = new Map<string, MessageRow[]>();
  for (const msg of allMessages) {
    if (!lastByChannel.has(msg.channelId)) lastByChannel.set(msg.channelId, msg);
    const arr = messagesByChannel.get(msg.channelId) ?? [];
    arr.push(msg);
    messagesByChannel.set(msg.channelId, arr);
  }

  const priority: ChannelListItem[] = [];
  const recent: ChannelListItem[] = [];
  for (const channel of channels) {
    const membership = memberships.find((m) => m.channelId === channel.id)!;
    const channelMembers = allMembers.filter((m) => m.channelId === channel.id);
    const last = lastByChannel.get(channel.id) ?? null;
    const cutoff = membership.lastReadAt;
    const unreadCount = (messagesByChannel.get(channel.id) ?? []).filter(
      (m) => m.senderId !== ctx.userId && (!cutoff || m.createdAt > cutoff),
    ).length;
    const item = await resolveGroupAvatar(
      toListItem(channel, membership, channelMembers, userMap, ctx.userId, last, unreadCount),
      channel,
    );
    if (membership.isPinned) priority.push(item);
    else recent.push(item);
  }

  const byLatest = (a: ChannelListItem, b: ChannelListItem) =>
    new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  priority.sort(byLatest);
  recent.sort(byLatest);
  return { priority, recent };
}

export async function findById(ctx: OrgContext, channelId: string): Promise<ChannelListItem> {
  const channel = await getChannelOr404(ctx, channelId);
  const members = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId },
  });
  const membership = members.find((m) => m.userId === ctx.userId);
  if (!membership) throw new HttpError(403, "Not a member of this channel");

  const userMap = await loadPublicUsers(members.map((m) => m.userId));
  const last = await prisma.qcMessage.findFirst({
    where: { orgId: ctx.orgId, channelId },
    orderBy: { createdAt: "desc" },
  });
  return resolveGroupAvatar(
    toListItem(channel, membership, members, userMap, ctx.userId, last, 0),
    channel,
  );
}

function toListItem(
  channel: ChannelRow,
  membership: MemberRow,
  members: MemberRow[],
  userMap: Map<string, PublicUser>,
  requestingUserId: string,
  lastMessage: MessageRow | null,
  unreadCount: number,
): ChannelListItem {
  const memberPublics = members
    .map((m) => userMap.get(m.userId))
    .filter((u): u is PublicUser => !!u);

  let name = channel.name;
  let avatarUrl = channel.avatarUrl;
  if (channel.type === "dm") {
    const other =
      memberPublics.find((u) => u.id !== requestingUserId && u.id !== ASSISTANT_BOT_USER_ID) ??
      memberPublics.find((u) => u.id !== requestingUserId);
    name = other?.displayName ?? "Direct Message";
    avatarUrl = other?.avatarUrl ?? null;
  } else if (channel.type === "ai") {
    // Derived (never stored) so every AI chat presents identically. The dm
    // "other member" logic must NOT run — the only other member is the bot.
    name = "AI Chat";
    avatarUrl = memberPublics.find((u) => u.id === ASSISTANT_BOT_USER_ID)?.avatarUrl ?? null;
  }

  const memberReadAt: Record<string, string | null> = {};
  const memberDeliveredAt: Record<string, string | null> = {};
  for (const m of members) {
    if (m.userId === requestingUserId) continue;
    memberReadAt[m.userId] = m.lastReadAt ? m.lastReadAt.toISOString() : null;
    memberDeliveredAt[m.userId] = m.lastDeliveredAt ? m.lastDeliveredAt.toISOString() : null;
  }

  const lastActivityAt = (lastMessage?.createdAt ?? channel.updatedAt).toISOString();

  return {
    channelId: channel.id,
    name,
    description: channel.description,
    avatarUrl,
    type: channel.type as ChannelListItem["type"],
    visibility: channel.visibility as ChannelListItem["visibility"],
    isPriority: membership.isPinned,
    unreadCount,
    lastActivityAt,
    members: memberPublics,
    memberReadAt,
    memberDeliveredAt,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          type: lastMessage.type,
          content: lastMessage.content,
          senderId: lastMessage.senderId,
          createdAt: lastMessage.createdAt.toISOString(),
        }
      : null,
  };
}

// ============================================================================
// Per-member state
// ============================================================================

export async function setPinned(
  ctx: OrgContext,
  channelId: string,
  isPinned: boolean,
): Promise<{ pinned: boolean }> {
  const member = await requireMember(ctx, channelId);
  await prisma.qcChannelMember.update({ where: { id: member.id }, data: { isPinned } });
  return { pinned: isPinned };
}

export async function markRead(ctx: OrgContext, channelId: string): Promise<{ ok: true }> {
  const member = await requireMember(ctx, channelId);
  const readAt = new Date();
  await prisma.qcChannelMember.update({
    where: { id: member.id },
    data: { lastReadAt: readAt },
  });
  // Live read-receipts: other members' clients merge this into memberReadAt so a
  // sender's "Read" indicator updates without a refetch.
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "read",
    payload: { channelId, userId: ctx.userId, readAt: readAt.toISOString() },
  });
  // Opening a channel silences its bell (S10a): clear unread notification rows
  // for it. Best-effort — never blocks/fails the read path.
  void notifications.markReadByChannel(ctx, channelId).catch(() => undefined);
  return { ok: true };
}

/**
 * Advance the caller's delivery watermark (S14a). Monotonic — never moves
 * backwards. Mirrors `markRead` but for "their client received it": publishes a
 * `delivered` event so senders' clients update the ✓✓ tick without a refetch.
 */
export async function markDelivered(
  ctx: OrgContext,
  channelId: string,
  at?: string,
): Promise<{ ok: true; deliveredAt: string }> {
  const member = await requireMember(ctx, channelId);
  const candidate = at ? new Date(at) : new Date();
  const deliveredAt =
    member.lastDeliveredAt && member.lastDeliveredAt > candidate
      ? member.lastDeliveredAt
      : candidate;
  // Only write + publish when it actually advances.
  if (!member.lastDeliveredAt || deliveredAt.getTime() !== member.lastDeliveredAt.getTime()) {
    await prisma.qcChannelMember.update({
      where: { id: member.id },
      data: { lastDeliveredAt: deliveredAt },
    });
    await publishFanout({
      orgId: ctx.orgId,
      channelId,
      event: "delivered",
      payload: { channelId, userId: ctx.userId, deliveredAt: deliveredAt.toISOString() },
    });
  }
  return { ok: true, deliveredAt: deliveredAt.toISOString() };
}

// ============================================================================
// Members
// ============================================================================

export async function listMembers(ctx: OrgContext, channelId: string): Promise<ChannelMemberDto[]> {
  await requireMember(ctx, channelId);
  const members = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId },
    orderBy: { joinedAt: "asc" },
  });
  const userMap = await loadPublicUsers(members.map((m) => m.userId));
  return members.map((m) => {
    const pub = userMap.get(m.userId) ?? {
      id: m.userId,
      displayName: "Unknown",
      avatarUrl: null,
    };
    return {
      ...pub,
      role: m.role as ChannelMemberDto["role"],
      joinedAt: m.joinedAt.toISOString(),
    };
  });
}

export async function addMember(
  ctx: OrgContext,
  channelId: string,
  newUserId: string,
): Promise<ChannelListItem> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group")
    throw new HttpError(400, "Only group channels can have members added");
  await requireChannelAdminOrModerator(ctx, channelId, "update");
  const existing = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: newUserId } },
  });
  if (existing) throw new HttpError(400, "User is already a member");

  await prisma.qcChannelMember.create({
    data: { orgId: ctx.orgId, channelId, userId: newUserId, role: "member" },
  });
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_created",
    payload: { channelId, memberIds: [newUserId] },
  });
  const [actor, target] = await Promise.all([displayNameOf(ctx.userId), displayNameOf(newUserId)]);
  await emitSystemMessage(ctx, channelId, `${actor} added ${target} to the chat`);
  return findById(ctx, channelId);
}

export async function removeMember(
  ctx: OrgContext,
  channelId: string,
  targetUserId: string,
): Promise<{ removed: true }> {
  if (ctx.userId === targetUserId) throw new HttpError(400, "Use leave to remove yourself");
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group") throw new HttpError(400, "Only group members can be removed");
  await requireChannelAdminOrModerator(ctx, channelId, "delete");
  const target = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: targetUserId } },
  });
  if (!target) throw new HttpError(404, "User is not a member");

  await prisma.qcChannelMember.delete({ where: { id: target.id } });
  const [actor, removed] = await Promise.all([
    displayNameOf(ctx.userId),
    displayNameOf(targetUserId),
  ]);
  await emitSystemMessage(ctx, channelId, `${actor} removed ${removed} from the chat`);
  await publishRosterChanged(ctx.orgId, channelId);
  return { removed: true };
}

export async function updateMemberRole(
  ctx: OrgContext,
  channelId: string,
  targetUserId: string,
  role: "admin" | "member",
): Promise<{ role: "admin" | "member" }> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group") throw new HttpError(400, "Only group member roles can be changed");
  await requireChannelAdminOrModerator(ctx, channelId, "update");
  const target = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: targetUserId } },
  });
  if (!target) throw new HttpError(404, "User is not a member");

  if (role === "member" && target.role === "admin") {
    const adminCount = await prisma.qcChannelMember.count({
      where: { orgId: ctx.orgId, channelId, role: "admin" },
    });
    if (adminCount <= 1) throw new HttpError(400, "Cannot demote the last admin");
  }
  await prisma.qcChannelMember.update({ where: { id: target.id }, data: { role } });
  await publishRosterChanged(ctx.orgId, channelId);
  return { role };
}

// ============================================================================
// Group admin: edit details + delete-for-everyone (QC_008)
// ============================================================================

/**
 * Edit group details (name / description / avatar). Admin/moderator-gated,
 * GROUP-ONLY (dm/ai names + avatars are derived, never stored). Only the
 * provided fields change. `avatarUrl` is the uploaded object's storage path;
 * we persist the path but publish a signed URL so members render it directly.
 * Publishes `channel_updated` for live in-place updates.
 */
export async function updateChannel(
  ctx: OrgContext,
  channelId: string,
  patch: UpdateChannelInput,
): Promise<ChannelListItem> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group") throw new HttpError(400, "Only group details can be edited");
  await requireChannelAdminOrModerator(ctx, channelId, "update");

  const data: { name?: string; description?: string | null; avatarUrl?: string } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new HttpError(400, "Group name cannot be empty");
    if (name.length > 100) throw new HttpError(400, "Group name is too long (max 100)");
    data.name = name;
  }
  if (patch.description !== undefined) {
    const desc = patch.description.trim();
    if (desc.length > 500) throw new HttpError(400, "Description is too long (max 500)");
    data.description = desc || null;
  }
  if (patch.avatarUrl !== undefined) {
    if (typeof patch.avatarUrl !== "string" || !patch.avatarUrl) {
      throw new HttpError(400, "avatarUrl must be a non-empty object path");
    }
    data.avatarUrl = patch.avatarUrl;
  }
  if (Object.keys(data).length === 0) throw new HttpError(400, "No changes provided");

  const renamed = data.name !== undefined && data.name !== channel.name;
  await prisma.qcChannel.update({ where: { id: channelId }, data });

  const avatarSigned = data.avatarUrl ? await signAvatar(data.avatarUrl) : undefined;
  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_updated",
    payload: {
      channelId,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(avatarSigned ? { avatarUrl: avatarSigned } : {}),
    },
  });
  if (renamed) {
    await emitSystemMessage(
      ctx,
      channelId,
      `${await displayNameOf(ctx.userId)} renamed the group to "${data.name}"`,
    );
  }
  return findById(ctx, channelId);
}

/**
 * Delete-for-everyone (Teams-style). Admin/moderator-gated, GROUP-ONLY (dm/ai
 * are never deleted this way — a dm/ai is torn down via `leave`). Removes the
 * channel + its messages + all memberships + any invites in one transaction
 * (messages/members first — the channel FK is Restrict), then publishes
 * `channel_deleted` with the member ids so every client removes it live.
 */
export async function deleteChannel(
  ctx: OrgContext,
  channelId: string,
): Promise<{ deleted: true }> {
  const channel = await getChannelOr404(ctx, channelId);
  if (channel.type !== "group") throw new HttpError(400, "Only group channels can be deleted");
  await requireChannelAdminOrModerator(ctx, channelId, "delete");

  const members = await prisma.qcChannelMember.findMany({
    where: { orgId: ctx.orgId, channelId },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);

  await prisma.$transaction([
    prisma.qcMessage.deleteMany({ where: { orgId: ctx.orgId, channelId } }),
    prisma.qcChannelMember.deleteMany({ where: { orgId: ctx.orgId, channelId } }),
    prisma.qcInvite.deleteMany({ where: { orgId: ctx.orgId, channelId } }),
    prisma.qcChannel.deleteMany({ where: { id: channelId, orgId: ctx.orgId } }),
  ]);

  await publishFanout({
    orgId: ctx.orgId,
    channelId,
    event: "channel_deleted",
    payload: { channelId, memberIds },
  });
  return { deleted: true };
}

/**
 * Caller leaves. If they were the last member, the channel and its messages are
 * deleted. Otherwise a "left the chat" system message is posted (groups only).
 *
 * No last-admin guard: unlike `updateMemberRole`, this lets the sole admin
 * leave a group with members still in it, orphaning it (no one left who can
 * add members, change roles, or delete it). Deliberately not blocked here — a
 * hard block would trap that admin permanently if no one else can be promoted
 * first. Backlog: either auto-promote the longest-tenured remaining member
 * (WhatsApp-style) or require assigning a new owner before leave succeeds
 * (Teams-style).
 */
export async function leave(ctx: OrgContext, channelId: string): Promise<{ deleted: boolean }> {
  const member = await prisma.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId: ctx.orgId, channelId, userId: ctx.userId } },
  });
  if (!member) throw new HttpError(403, "Not a member of this channel");
  const channel = await prisma.qcChannel.findFirst({ where: { id: channelId, orgId: ctx.orgId } });

  // An AI chat is a per-user singleton; its only other member is the synthetic
  // bot, so "last human leaves" == delete the whole thing. The user can reopen
  // it any time (findOrCreateAiChat), so wholesale deletion is the sane behavior
  // (the generic "remaining === 0" branch below would never fire — the bot keeps
  // the count at 1 — leaving an orphaned bot-only channel).
  if (channel?.type === "ai") {
    await prisma.qcMessage.deleteMany({ where: { orgId: ctx.orgId, channelId } });
    await prisma.qcChannelMember.deleteMany({ where: { orgId: ctx.orgId, channelId } });
    await prisma.qcChannel.deleteMany({ where: { id: channelId, orgId: ctx.orgId } });
    return { deleted: true };
  }

  await prisma.qcChannelMember.delete({ where: { id: member.id } });
  const remaining = await prisma.qcChannelMember.count({
    where: { orgId: ctx.orgId, channelId },
  });
  if (remaining === 0) {
    await prisma.qcMessage.deleteMany({ where: { orgId: ctx.orgId, channelId } });
    await prisma.qcChannel.deleteMany({ where: { id: channelId, orgId: ctx.orgId } });
    return { deleted: true };
  }
  if (channel?.type === "group") {
    await emitSystemMessage(ctx, channelId, `${await displayNameOf(ctx.userId)} left the chat`);
  }
  await publishRosterChanged(ctx.orgId, channelId);
  return { deleted: false };
}
