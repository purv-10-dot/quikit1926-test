import { assertReadAccess, HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import type { OrgActor } from "@/lib/shared";
import * as channels from "./channels.service";
import { loadPublicUsers, type MessageRow } from "./helpers";

const RECENT_LIMIT = 30;
const TEXT_CAP = 280;

function truncate(s: string): string {
  return s.length > TEXT_CAP ? s.slice(0, TEXT_CAP) + "…" : s;
}

export interface CompactMessage {
  id: string;
  actorType: string;
  senderId: string | null;
  displayName: string;
  type: string;
  text: string;
  createdAt: string;
}

function compact(m: MessageRow, nameById: Map<string, string>): CompactMessage {
  return {
    id: m.id,
    actorType: m.actorType === "ai_agent" ? "ai_agent" : "human",
    senderId: m.senderId,
    displayName: m.senderId ? (nameById.get(m.senderId) ?? "Unknown") : "system",
    type: m.type,
    text: truncate(m.content ?? ""),
    createdAt: m.createdAt.toISOString(),
  };
}

export interface ChannelSummary {
  channelId: string;
  orgId: string;
  name: string | null;
  type: string;
  visibility: string;
  memberCount: number;
  members: Array<{ id: string; displayName: string }>;
  pinnedCount: number;
  recentMessages: CompactMessage[];
  unreadForActor?: number;
}

export async function channelSummary(actor: OrgActor, channelId: string): Promise<ChannelSummary> {
  await assertReadAccess(actor, channelId);
  const channel = await prisma.qcChannel.findFirst({
    where: { id: channelId, orgId: actor.orgId },
  });
  if (!channel) throw new HttpError(404, "Channel not found");

  const members = await prisma.qcChannelMember.findMany({
    where: { orgId: actor.orgId, channelId },
  });
  const userMap = await loadPublicUsers(members.map((m) => m.userId));
  const nameById = new Map([...userMap].map(([id, u]) => [id, u.displayName]));

  const pinnedCount = await prisma.qcMessage.count({
    where: { orgId: actor.orgId, channelId, isPinned: true },
  });
  const recentDesc = await prisma.qcMessage.findMany({
    where: { orgId: actor.orgId, channelId },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });
  const recent = recentDesc.reverse();
  // Resolve any sender names not already in the member map (e.g. removed members).
  const extra = await loadPublicUsers(recent.map((m) => m.senderId));
  for (const [id, u] of extra) if (!nameById.has(id)) nameById.set(id, u.displayName);

  const summary: ChannelSummary = {
    channelId: channel.id,
    orgId: channel.orgId,
    name: channel.name,
    type: channel.type,
    visibility: channel.visibility,
    memberCount: members.length,
    members: members.map((m) => ({
      id: m.userId,
      displayName: nameById.get(m.userId) ?? "Unknown",
    })),
    pinnedCount,
    recentMessages: recent.map((m) => compact(m, nameById)),
  };

  if (actor.actorType === "human" && actor.userId) {
    const me = members.find((m) => m.userId === actor.userId);
    const cutoff = me?.lastReadAt ?? null;
    summary.unreadForActor = recent.filter(
      (m) => m.senderId !== actor.userId && (!cutoff || m.createdAt > cutoff),
    ).length;
  }
  return summary;
}

export interface ThreadSummary {
  rootMessageId: string;
  channelId: string;
  root: CompactMessage;
  replies: CompactMessage[];
}

export async function threadSummary(
  actor: OrgActor,
  rootMessageId: string,
): Promise<ThreadSummary> {
  const root = await prisma.qcMessage.findFirst({
    where: { id: rootMessageId, orgId: actor.orgId },
  });
  if (!root) throw new HttpError(404, "Message not found");
  await assertReadAccess(actor, root.channelId);

  const replies = await prisma.qcMessage.findMany({
    where: { orgId: actor.orgId, parentMessageId: rootMessageId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const nameById = new Map(
    [...(await loadPublicUsers([root.senderId, ...replies.map((r) => r.senderId)]))].map(
      ([id, u]) => [id, u.displayName],
    ),
  );

  return {
    rootMessageId: root.id,
    channelId: root.channelId,
    root: compact(root, nameById),
    replies: replies.map((r) => compact(r, nameById)),
  };
}

export interface ActivityItem {
  channelId: string;
  name: string | null;
  unreadCount?: number;
  lastActivityAt: string;
}

export async function activitySummary(actor: OrgActor): Promise<{ channels: ActivityItem[] }> {
  if (actor.actorType === "human" && actor.userId) {
    const list = await channels.listForUser({ userId: actor.userId, orgId: actor.orgId });
    const items = [...list.priority, ...list.recent].map((c) => ({
      channelId: c.channelId,
      name: c.name,
      unreadCount: c.unreadCount,
      lastActivityAt: c.lastActivityAt,
    }));
    return { channels: items };
  }

  // Agent: scoped to channelScope when present, else all org channels. No unread.
  const rows = await prisma.qcChannel.findMany({
    where: {
      orgId: actor.orgId,
      ...(actor.channelScope ? { id: { in: actor.channelScope } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return {
    channels: rows.map((c) => ({
      channelId: c.id,
      name: c.name,
      lastActivityAt: c.updatedAt.toISOString(),
    })),
  };
}
