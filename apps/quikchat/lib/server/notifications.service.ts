import { assertMembership, HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import {
  captureError,
  logger,
  publishFanout,
  type Mention,
  type NotificationDto,
  type NotificationKeywordDto,
  type NotificationLevel,
  type NotificationPreferenceDto,
  type NotificationSettingsDto,
  type NotificationType,
  type OrgContext,
} from "@/lib/shared";
import { displayNameOf } from "./helpers";

// ============================================================================
// Row types (subset of the Prisma models we read/write here)
// ============================================================================

interface NotificationRow {
  id: string;
  type: string;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  preview: string;
  meta: unknown;
  isRead: boolean;
  createdAt: Date;
}

interface SettingsRow {
  defaultChannelLevel: string;
  dmsLevel: string;
  soundEnabled: boolean;
  callSoundsEnabled: boolean;
  desktopEnabled: boolean;
  emailEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string | null;
  dndEnd: string | null;
  snoozedUntil: Date | null;
  priorityDuringDnd: boolean;
}

/** A message/reaction the delivery pipeline can build a preview + row from. */
export interface DeliverableMessage {
  id: string;
  type?: string;
  content?: string | null;
  data?: unknown;
  senderId?: string | null;
}

interface DeliveryCandidate {
  userId: string;
  type: NotificationType;
  /** Why this user qualifies — drives priority + the UI label. */
  reason: "mention" | "everyone" | "dm" | "keyword" | "reaction" | "thread_reply";
  meta?: Record<string, unknown>;
}

interface DeliveryDecision {
  persistRow: boolean;
  desktop: boolean;
  /**
   * Should the client play a notification sound? Shares every upstream
   * suppression with `desktop` (mute / snooze / DND / level) but is gated on its
   * OWN setting at the end — `soundEnabled` and `desktopEnabled` are independent
   * toggles, so sound-on + desktop-off must still be audible.
   */
  sound: boolean;
  /** Persist the row but pre-mark it read (muted channels) so the badge stays clean. */
  persistAsRead: boolean;
}

// ============================================================================
// Serialization
// ============================================================================

export function serialize(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    actorId: row.actorId,
    channelId: row.channelId,
    messageId: row.messageId,
    preview: row.preview,
    meta: (row.meta as Record<string, unknown> | null) ?? {},
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSettingsDto(row: SettingsRow): NotificationSettingsDto {
  return {
    defaultChannelLevel: row.defaultChannelLevel as NotificationLevel,
    dmsLevel: row.dmsLevel as NotificationLevel,
    soundEnabled: row.soundEnabled,
    callSoundsEnabled: row.callSoundsEnabled,
    desktopEnabled: row.desktopEnabled,
    emailEnabled: row.emailEnabled,
    dndEnabled: row.dndEnabled,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
    priorityDuringDnd: row.priorityDuringDnd,
  };
}

// ============================================================================
// User-level settings
// ============================================================================

/** Return-or-create the settings row. Defaults match a "sane Slack" install. */
export async function getOrCreateSettings(orgId: string, userId: string): Promise<SettingsRow> {
  const existing = await prisma.qcUserNotificationSettings.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (existing) return existing;
  try {
    return await prisma.qcUserNotificationSettings.create({ data: { orgId, userId } });
  } catch {
    // Lost the create race — read the winner.
    return prisma.qcUserNotificationSettings.findUniqueOrThrow({
      where: { orgId_userId: { orgId, userId } },
    });
  }
}

const SETTINGS_FIELDS = [
  "defaultChannelLevel",
  "dmsLevel",
  "soundEnabled",
  "callSoundsEnabled",
  "desktopEnabled",
  "emailEnabled",
  "dndEnabled",
  "dndStart",
  "dndEnd",
  "snoozedUntil",
  "priorityDuringDnd",
] as const;

export interface SettingsPatch {
  defaultChannelLevel?: NotificationLevel;
  dmsLevel?: NotificationLevel;
  soundEnabled?: boolean;
  callSoundsEnabled?: boolean;
  desktopEnabled?: boolean;
  emailEnabled?: boolean;
  dndEnabled?: boolean;
  dndStart?: string | null;
  dndEnd?: string | null;
  snoozedUntil?: Date | null;
  priorityDuringDnd?: boolean;
}

export async function getSettings(ctx: OrgContext): Promise<NotificationSettingsDto> {
  return toSettingsDto(await getOrCreateSettings(ctx.orgId, ctx.userId));
}

export async function updateSettings(
  ctx: OrgContext,
  patch: SettingsPatch,
): Promise<NotificationSettingsDto> {
  await getOrCreateSettings(ctx.orgId, ctx.userId);
  // Allow-list: copy only the fields we explicitly permit.
  const data: Record<string, unknown> = {};
  for (const key of SETTINGS_FIELDS) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  const row = await prisma.qcUserNotificationSettings.update({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    data,
  });
  return toSettingsDto(row);
}

// ============================================================================
// Per-channel preferences
// ============================================================================

export async function getChannelPreference(
  orgId: string,
  userId: string,
  channelId: string,
): Promise<{ level: NotificationLevel; mutedUntil: Date | null } | null> {
  const row = await prisma.qcNotificationPreference.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (!row || row.orgId !== orgId) return null;
  return { level: row.level as NotificationLevel, mutedUntil: row.mutedUntil };
}

export async function getChannelPreferenceDto(
  ctx: OrgContext,
  channelId: string,
): Promise<NotificationPreferenceDto> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const pref = await getChannelPreference(ctx.orgId, ctx.userId, channelId);
  return {
    channelId,
    level: pref ? pref.level : null, // null = inherit default
    mutedUntil: pref?.mutedUntil ? pref.mutedUntil.toISOString() : null,
  };
}

export async function setChannelPreference(
  ctx: OrgContext,
  channelId: string,
  patch: { level?: NotificationLevel; mutedUntil?: Date | null },
): Promise<NotificationPreferenceDto> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const row = await prisma.qcNotificationPreference.upsert({
    where: { userId_channelId: { userId: ctx.userId, channelId } },
    create: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      channelId,
      level: patch.level ?? "all",
      mutedUntil: patch.mutedUntil ?? null,
    },
    update: {
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.mutedUntil !== undefined ? { mutedUntil: patch.mutedUntil } : {}),
    },
  });
  return {
    channelId,
    level: row.level as NotificationLevel,
    mutedUntil: row.mutedUntil ? row.mutedUntil.toISOString() : null,
  };
}

// ============================================================================
// Keywords
// ============================================================================

export async function listKeywords(ctx: OrgContext): Promise<NotificationKeywordDto[]> {
  const rows = await prisma.qcNotificationKeyword.findMany({
    where: { orgId: ctx.orgId, userId: ctx.userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, keyword: r.keyword, createdAt: r.createdAt.toISOString() }));
}

export async function addKeyword(
  ctx: OrgContext,
  keyword: string,
): Promise<NotificationKeywordDto> {
  const trimmed = (keyword ?? "").trim().toLowerCase();
  if (!trimmed) throw new HttpError(400, "Keyword cannot be empty");
  if (trimmed.length > 64) throw new HttpError(400, "Keyword too long (max 64 chars)");
  const existing = await prisma.qcNotificationKeyword.findUnique({
    where: { userId_keyword: { userId: ctx.userId, keyword: trimmed } },
  });
  if (existing && existing.orgId === ctx.orgId) {
    return {
      id: existing.id,
      keyword: existing.keyword,
      createdAt: existing.createdAt.toISOString(),
    };
  }
  const row = await prisma.qcNotificationKeyword.create({
    data: { orgId: ctx.orgId, userId: ctx.userId, keyword: trimmed },
  });
  return { id: row.id, keyword: row.keyword, createdAt: row.createdAt.toISOString() };
}

export async function removeKeyword(ctx: OrgContext, id: string): Promise<void> {
  const row = await prisma.qcNotificationKeyword.findFirst({
    where: { id, orgId: ctx.orgId, userId: ctx.userId },
  });
  if (!row) throw new HttpError(404, "Keyword not found");
  await prisma.qcNotificationKeyword.delete({ where: { id: row.id } });
}

// ============================================================================
// Activity feed (list + mark read)
// ============================================================================

export async function list(
  ctx: OrgContext,
  opts: { limit?: number; before?: string; unreadOnly?: boolean } = {},
): Promise<NotificationDto[]> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const where: {
    orgId: string;
    userId: string;
    isRead?: boolean;
    createdAt?: { lt: Date };
  } = { orgId: ctx.orgId, userId: ctx.userId };
  if (opts.unreadOnly) where.isRead = false;
  if (opts.before) {
    const cursor = await prisma.qcNotification.findFirst({
      where: { id: opts.before, orgId: ctx.orgId, userId: ctx.userId },
    });
    if (cursor) where.createdAt = { lt: cursor.createdAt };
  }
  const rows = await prisma.qcNotification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serialize);
}

export async function unreadCount(ctx: OrgContext): Promise<number> {
  return prisma.qcNotification.count({
    where: { orgId: ctx.orgId, userId: ctx.userId, isRead: false },
  });
}

export async function unreadByChannel(ctx: OrgContext): Promise<Record<string, number>> {
  const rows = await prisma.qcNotification.groupBy({
    by: ["channelId"],
    where: { orgId: ctx.orgId, userId: ctx.userId, isRead: false, channelId: { not: null } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.channelId) out[r.channelId] = r._count._all;
  return out;
}

export async function markRead(ctx: OrgContext, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await prisma.qcNotification.updateMany({
    where: { orgId: ctx.orgId, userId: ctx.userId, id: { in: ids } },
    data: { isRead: true },
  });
  return res.count;
}

export async function markAllRead(ctx: OrgContext): Promise<number> {
  const res = await prisma.qcNotification.updateMany({
    where: { orgId: ctx.orgId, userId: ctx.userId, isRead: false },
    data: { isRead: true },
  });
  return res.count;
}

/**
 * Mark every unread notification for one channel as read — fired when a user
 * opens (or refocuses) a channel. The rows stay in the feed; only the unread
 * badge stops counting them. Returns the affected count so the client can
 * decrement its cached unread without a refetch.
 */
export async function markReadByChannel(
  ctx: OrgContext,
  channelId: string,
): Promise<{ affected: number }> {
  const res = await prisma.qcNotification.updateMany({
    where: { orgId: ctx.orgId, userId: ctx.userId, channelId, isRead: false },
    data: { isRead: true },
  });
  return { affected: res.count };
}

export async function clearAll(ctx: OrgContext): Promise<void> {
  await prisma.qcNotification.deleteMany({ where: { orgId: ctx.orgId, userId: ctx.userId } });
}

// ============================================================================
// Delivery
// ============================================================================

/**
 * Decide what notifications a brand-new message should generate, persist them,
 * and publish the per-user `notification` realtime event to each recipient.
 * Called from messages.service.send AFTER the message is persisted + fanned out.
 * Best-effort: never throws into the caller.
 */
export async function deliverForMessage(
  orgId: string,
  channelId: string,
  senderId: string,
  message: DeliverableMessage,
  mentions: Mention[] | undefined,
): Promise<void> {
  try {
    const channel = await prisma.qcChannel.findFirst({ where: { id: channelId, orgId } });
    if (!channel) return;

    const memberRows = await prisma.qcChannelMember.findMany({
      where: { orgId, channelId },
      select: { userId: true },
    });
    const recipients = memberRows.map((m) => m.userId).filter((id) => id !== senderId);
    if (recipients.length === 0) return;

    // Resolve @everyone → every recipient gets a mention candidate. Targeted
    // mentions stay as-is.
    const mentionedSet = new Set<string>();
    let everyone = false;
    for (const m of mentions ?? []) {
      if (m.userId === "everyone") everyone = true;
      else mentionedSet.add(m.userId);
    }
    const targetedSet = new Set(mentionedSet);
    if (everyone) for (const id of recipients) mentionedSet.add(id);

    // One query for all recipients' keywords (don't fan out N queries).
    const allKeywords = await prisma.qcNotificationKeyword.findMany({
      where: { orgId, userId: { in: recipients } },
    });
    const keywordsByUser = new Map<string, string[]>();
    for (const k of allKeywords) {
      const list = keywordsByUser.get(k.userId) ?? [];
      list.push(k.keyword);
      keywordsByUser.set(k.userId, list);
    }

    const isDM = channel.type === "dm";
    const candidates: DeliveryCandidate[] = [];

    for (const userId of recipients) {
      if (isDM) {
        candidates.push({ userId, type: "dm", reason: "dm" });
        continue;
      }
      if (mentionedSet.has(userId)) {
        candidates.push({
          userId,
          type: "mention",
          reason: everyone && !targetedSet.has(userId) ? "everyone" : "mention",
        });
        continue;
      }
      const userKeywords = keywordsByUser.get(userId);
      if (userKeywords?.length) {
        const hit = matchKeyword(message.content ?? "", userKeywords);
        if (hit) {
          candidates.push({ userId, type: "keyword", reason: "keyword", meta: { keyword: hit } });
        }
      }
    }
    if (candidates.length === 0) return;

    const actorName = await displayNameOf(senderId);
    const preview = makePreview(message);

    for (const cand of candidates) {
      const allow = await shouldDeliver(orgId, cand.userId, channelId, channel.type, cand.reason);
      if (!allow.persistRow) continue;
      const row = await prisma.qcNotification.create({
        data: {
          orgId,
          userId: cand.userId,
          type: cand.type,
          actorId: senderId,
          channelId,
          messageId: message.id ?? null,
          preview,
          isRead: allow.persistAsRead,
          meta: {
            channelName: channel.name,
            channelType: channel.type,
            actorName,
            reason: cand.reason,
            ...(cand.meta ?? {}),
          },
        },
      });
      await emitNotification(orgId, cand.userId, row, allow.desktop, allow.sound);
    }
  } catch (e) {
    await captureError(e, { scope: "deliverForMessage", orgId, channelId });
    logger.error({ orgId, channelId, scope: "deliverForMessage" }, "notification delivery failed");
  }
}

/** Reaction events — low priority; only the original sender is notified. */
export async function deliverForReaction(
  orgId: string,
  channelId: string,
  recipientId: string,
  actorId: string,
  emoji: string,
  message: DeliverableMessage,
): Promise<void> {
  try {
    if (recipientId === actorId) return;
    const allow = await shouldDeliver(orgId, recipientId, channelId, undefined, "reaction");
    if (!allow.persistRow) return;
    const channel = await prisma.qcChannel.findFirst({ where: { id: channelId, orgId } });
    const actorName = await displayNameOf(actorId);
    const row = await prisma.qcNotification.create({
      data: {
        orgId,
        userId: recipientId,
        type: "reaction",
        actorId,
        channelId,
        messageId: message.id ?? null,
        preview: `${emoji} on your message`,
        isRead: allow.persistAsRead,
        meta: {
          channelName: channel?.name,
          channelType: channel?.type,
          actorName,
          emoji,
          reason: "reaction",
        },
      },
    });
    await emitNotification(orgId, recipientId, row, allow.desktop, allow.sound);
  } catch (e) {
    await captureError(e, { scope: "deliverForReaction", orgId, channelId });
    logger.error({ orgId, channelId, scope: "deliverForReaction" }, "reaction notify failed");
  }
}

/** Publish the per-user `notification` event (row + transient alert flags). */
async function emitNotification(
  orgId: string,
  userId: string,
  row: NotificationRow,
  desktop: boolean,
  sound: boolean,
): Promise<void> {
  await publishFanout({
    orgId,
    userId,
    channelId: row.channelId ?? "",
    event: "notification",
    payload: { ...serialize(row), desktop, sound },
  });
}

/**
 * Resolve whether a notification should be persisted and whether the client
 * should fire an OS-level alert and/or play a sound. Persistence still happens
 * for muted channels (the activity feed should stay complete); the alerts are
 * what get suppressed. `now` is injectable for deterministic tests.
 */
export async function shouldDeliver(
  orgId: string,
  userId: string,
  channelId: string,
  channelType: string | undefined,
  reason: DeliveryCandidate["reason"],
  now: Date = new Date(),
): Promise<DeliveryDecision> {
  const settings = await getOrCreateSettings(orgId, userId);
  const pref = await getChannelPreference(orgId, userId, channelId);

  // Honour a temporary channel mute (snooze of just this channel).
  const channelMutedUntil = pref?.mutedUntil && pref.mutedUntil > now ? pref.mutedUntil : null;

  const channelLevel: NotificationLevel = channelMutedUntil
    ? "none"
    : (pref?.level ??
      ((channelType === "dm"
        ? settings.dmsLevel
        : settings.defaultChannelLevel) as NotificationLevel));

  if (reason === "reaction") {
    // Reactions only notify when the channel level is 'all'.
    if (channelLevel !== "all") {
      return { persistRow: false, desktop: false, sound: false, persistAsRead: false };
    }
  } else if (channelLevel === "none") {
    // Muted channel: persist (feed stays complete) but pre-mark read + silent.
    return { persistRow: true, desktop: false, sound: false, persistAsRead: true };
  }

  const priorityReason =
    reason === "mention" || reason === "everyone" || reason === "dm" || reason === "keyword";

  // Global snooze: suppress every alert (popup AND sound); row stays unread so
  // the user sees what they missed on un-snooze.
  if (settings.snoozedUntil && settings.snoozedUntil > now) {
    return { persistRow: true, desktop: false, sound: false, persistAsRead: false };
  }

  // DND quiet hours: priority events bypass if priorityDuringDnd is on.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (settings.dndEnabled && isInDndWindow(settings.dndStart, settings.dndEnd, nowMinutes)) {
    if (!(priorityReason && settings.priorityDuringDnd)) {
      return { persistRow: true, desktop: false, sound: false, persistAsRead: false };
    }
  }

  // Nothing upstream suppressed this one, so each channel is now down to its own
  // user setting. Deliberately NOT an early return on `desktopEnabled`: the two
  // toggles are independent, and short-circuiting on one would silently zero the
  // other (desktop off would mean sound off).
  return {
    persistRow: true,
    desktop: settings.desktopEnabled,
    sound: settings.soundEnabled,
    persistAsRead: false,
  };
}

// ============================================================================
// Pure helpers (exported for unit tests)
// ============================================================================

export function makePreview(message: DeliverableMessage | null | undefined): string {
  if (!message) return "";
  if (message.type === "Media") {
    const data = message.data as { originalName?: string } | null | undefined;
    return message.content || data?.originalName || "sent an attachment";
  }
  const raw = (message.content ?? "").trim();
  return raw.length > 240 ? raw.slice(0, 240) + "…" : raw;
}

/**
 * Case-insensitive SUBSTRING keyword match (S13). Matches user expectation that
 * "deploy" alerts on "deploying"/"deployment" — a plain `includes`, not a
 * whole-word match. Keywords are stored lowercased; returns the matched token.
 */
export function matchKeyword(content: string, keywords: string[]): string | null {
  if (!content) return null;
  const lower = content.toLowerCase();
  for (const kw of keywords) {
    if (kw && lower.includes(kw)) return kw;
  }
  return null;
}

/**
 * Is `nowMinutes` (minutes-since-local-midnight) inside the [start, end) DND
 * window? Handles the overnight wrap (e.g. 22:00→07:00). start===end ⇒ never.
 *
 * ⚠️ KEEP IN SYNC WITH `dndActiveNow` in `lib/notif-settings.ts`. This is the
 * authoritative copy; that one is a client-safe duplicate (this module imports
 * Prisma, so it can't be bundled for the browser) used to mute the incoming-call
 * ringtone. Change the semantics here and you must change it there too.
 */
export function isInDndWindow(
  start: string | null,
  end: string | null,
  nowMinutes: number,
): boolean {
  if (!start || !end) return false;
  const parse = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const startM = parse(start);
  const endM = parse(end);
  if (startM === endM) return false;
  if (startM < endM) return nowMinutes >= startM && nowMinutes < endM;
  // Overnight window.
  return nowMinutes >= startM || nowMinutes < endM;
}
