import { Prisma } from "@quikit/database";
import { assertMembership, HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import {
  emitIndexEvent,
  publishFanout,
  type Mention,
  type MentionRefInput,
  type MessageDto,
  type OrgContext,
  type SendMessageInput,
} from "@/lib/shared";
import { loadMeetingDto } from "./calendar.serialize";
import { MESSAGES_ORDER, olderThanCursor } from "./messages-cursor";
import { displayNameOf, loadPublicUsers, toMessageDto, type MessageRow } from "./helpers";
import * as notifications from "./notifications.service";
import { getStorage } from "./storage";

const MAX_CONTENT = 8000;

/**
 * How long after posting a message its sender may still edit it (QC_007).
 * SOURCE OF TRUTH for the window — the client mirrors this value in
 * `lib/message-actions.ts` (`EDIT_WINDOW_MS`) to hide the Edit action, since the
 * `@/lib/shared` barrel isn't importable from client bundles. Change both.
 */
export const EDIT_WINDOW_MS = 15 * 60_000;

/**
 * Types `send()` will accept. Mirrors `SendMessageInput.type` — the TYPE-level
 * statement of the same rule — because a type alone stops nothing: this
 * function's `dto` arrives from `POST /api/channels/[id]/messages` as an
 * unvalidated `readJson` body, so a hand-rolled request can name any string.
 *
 * ⚠️ TWO TYPES ARE MISSING FROM THIS LIST ON PURPOSE.
 *
 * `Delete` is a tombstone written by the delete path, never sent.
 *
 * `ApprovalRequest` is the one that turns this from tidiness into a security
 * boundary. That card renders from a `data` SNAPSHOT — it has to, because the
 * runtime's ledger is requester-scoped and 24h — so an accepted client-sent
 * one would render a fully convincing “Priya approved — QUIKSC-290 created” in
 * any channel the sender belongs to. The buttons would 404 (the runtime scopes
 * decisions on its own token), so nothing would be WRITTEN; the lie is the
 * outcome line, and that is enough. Compare `Meeting`, which is safe to accept
 * only because its card needs a server-hydrated projection and a forged one
 * renders empty — an accident of that design, not a rule this list can rely on.
 */
const CLIENT_SENDABLE_TYPES: ReadonlySet<string> = new Set([
  "Text",
  "Media",
  "SystemActivity",
  "Meeting",
  "Call",
]);

/** How a message was authored — defaults to a human; agents stamp ai_agent. */
export interface SendActor {
  actorType?: "human" | "ai_agent";
  agentRunId?: string;
}

/** Emit a search-index upsert for a persisted message row. */
function indexUpsert(orgId: string, row: MessageRow): void {
  void emitIndexEvent({
    op: "upsert",
    orgId,
    app: "quikchat",
    entity: "message",
    id: row.id,
    channelId: row.channelId,
    senderId: row.senderId,
    actorType: row.actorType,
    type: row.type,
    text: row.content,
    createdAt: row.createdAt.toISOString(),
  });
}

// ============================================================================
// Serialization (org-scoped parent lookup)
// ============================================================================

/**
 * Inject a fresh, short-lived `data.mediaUrl` for a `Media` message. URLs are
 * never persisted — they're minted per read (after the normal message-read auth)
 * so they stay short-lived and refresh on refetch if the TTL lapses.
 */
async function injectMediaUrl(dto: MessageDto): Promise<MessageDto> {
  if (dto.type !== "Media" || !dto.data) return dto;
  const data = dto.data as Record<string, unknown>;
  if (typeof data.objectPath !== "string") return dto;
  try {
    const mediaUrl = await getStorage().createDownloadUrl(data.objectPath, {
      contentType: typeof data.mediaType === "string" ? data.mediaType : undefined,
      downloadName: typeof data.originalName === "string" ? data.originalName : undefined,
    });
    return { ...dto, data: { ...data, mediaUrl } };
  } catch {
    return dto; // a failed mint leaves the row renderable sans URL
  }
}

/**
 * Inject the full `data.meeting` projection (S15a) for a `Meeting` message from
 * its `data.meetingId`, so the in-chat card renders + live-updates with no extra
 * client fetch. A missing meeting leaves the row renderable sans projection.
 */
async function injectMeetingData(ctx: OrgContext, dto: MessageDto): Promise<MessageDto> {
  if (dto.type !== "Meeting" || !dto.data) return dto;
  const data = dto.data as Record<string, unknown>;
  if (typeof data.meetingId !== "string") return dto;
  const meeting = await loadMeetingDto(ctx.orgId, data.meetingId);
  if (!meeting) return dto;
  return { ...dto, data: { ...data, meeting } };
}

async function serializeMany(ctx: OrgContext, messages: MessageRow[]): Promise<MessageDto[]> {
  if (!messages.length) return [];
  const parentIds = messages.map((m) => m.parentMessageId).filter((id): id is string => !!id);
  const parents = parentIds.length
    ? await prisma.qcMessage.findMany({ where: { orgId: ctx.orgId, id: { in: parentIds } } })
    : [];
  const parentMap = new Map(parents.map((p) => [p.id, p as MessageRow]));
  const dtos = messages.map((m) =>
    toMessageDto(m, m.parentMessageId ? (parentMap.get(m.parentMessageId) ?? null) : null),
  );
  return Promise.all(dtos.map((d) => injectMediaUrl(d).then((x) => injectMeetingData(ctx, x))));
}

async function serializeOne(ctx: OrgContext, message: MessageRow): Promise<MessageDto> {
  const [dto] = await serializeMany(ctx, [message]);
  return dto!;
}

// ============================================================================
// Mention validation
// ============================================================================

/**
 * Keep only mentions whose userId is a current member (or literal `everyone`),
 * whose offsets are in-bounds, and whose slice starts with `@`. `@everyone` is
 * only honoured when the slice is literally `@everyone`. De-duped per userId.
 */
export async function validateMentions(
  ctx: OrgContext,
  channelId: string,
  content: string,
  raw?: MentionRefInput[],
): Promise<Mention[]> {
  if (!raw || raw.length === 0) return [];

  const userIds = Array.from(new Set(raw.map((m) => m.userId).filter((id) => id !== "everyone")));
  let nameById = new Map<string, string>();
  if (userIds.length) {
    const memberRows = await prisma.qcChannelMember.findMany({
      where: { orgId: ctx.orgId, channelId },
      select: { userId: true },
    });
    const memberSet = new Set(memberRows.map((m) => m.userId));
    const validIds = userIds.filter((id) => memberSet.has(id));
    if (validIds.length) {
      const userMap = await loadPublicUsers(validIds);
      nameById = new Map(Array.from(userMap.values()).map((u) => [u.id, u.displayName]));
    }
  }

  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of raw) {
    if (seen.has(m.userId)) continue;
    if (m.offsetStart < 0 || m.offsetEnd > content.length) continue;
    if (m.offsetEnd <= m.offsetStart) continue;
    const slice = content.slice(m.offsetStart, m.offsetEnd);
    if (!slice.startsWith("@")) continue;
    let displayName: string;
    if (m.userId === "everyone") {
      if (slice.toLowerCase() !== "@everyone") continue;
      displayName = "everyone";
    } else {
      const name = nameById.get(m.userId);
      if (!name) continue;
      displayName = name;
    }
    seen.add(m.userId);
    out.push({ userId: m.userId, displayName, offsetStart: m.offsetStart, offsetEnd: m.offsetEnd });
  }
  return out;
}

// ============================================================================
// Read / send
// ============================================================================

export async function list(
  ctx: OrgContext,
  channelId: string,
  limit = 30,
  before?: string,
): Promise<MessageDto[]> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const where: Prisma.QcMessageWhereInput = { orgId: ctx.orgId, channelId };
  if (before) {
    // Scoped to `channelId`, not just `orgId`: an id from a DIFFERENT channel in
    // the same org used to resolve here and produce a plausible-looking wrong
    // page. It now takes the same 400 path as an unknown id.
    const cursor = await prisma.qcMessage.findFirst({
      where: { id: before, orgId: ctx.orgId, channelId },
      select: { id: true, createdAt: true },
    });
    // Previously this was `if (cursor)` with no else — an unknown id silently
    // dropped the filter and returned the NEWEST page: a 200 with wrong data,
    // which the client cannot distinguish from a legitimate response. Safe to
    // reject outright because deletes are tombstones (`type: "Delete"`, the row
    // and its id survive), so no legitimate scroll-back can hold a dead cursor.
    if (!cursor) throw new HttpError(400, "Unknown `before` cursor for this channel");
    Object.assign(where, olderThanCursor(cursor));
  }
  const messages = await prisma.qcMessage.findMany({
    where,
    orderBy: MESSAGES_ORDER,
    take: Math.min(limit, 100),
  });
  return serializeMany(ctx, messages);
}

export async function send(
  ctx: OrgContext,
  channelId: string,
  dto: SendMessageInput,
  actor: SendActor = {},
): Promise<MessageDto> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  if (typeof dto.content !== "string") throw new HttpError(400, "content is required");
  if (dto.content.length > MAX_CONTENT) throw new HttpError(400, "content too long");
  const type = dto.type ?? "Text";
  // Every writer goes through here, so the check lives here rather than at the
  // route — a second route added later inherits it instead of forgetting it.
  // Server-written types that are not client-sendable (ApprovalRequest) use
  // their own writer, the way `emitSystemMessage` already does.
  if (!CLIENT_SENDABLE_TYPES.has(type)) {
    throw new HttpError(400, `Unsupported message type: ${type}`);
  }

  if (dto.parentMessageId) {
    const parent = await prisma.qcMessage.findFirst({
      where: { id: dto.parentMessageId, orgId: ctx.orgId },
    });
    if (!parent || parent.channelId !== channelId) {
      throw new HttpError(404, "Parent message not found in this channel");
    }
  }

  // Idempotency: a retried/reconnected send carrying the same clientMessageId
  // returns the already-persisted row instead of double-posting.
  if (dto.clientMessageId) {
    const existing = await prisma.qcMessage.findFirst({
      where: { channelId, clientMessageId: dto.clientMessageId },
    });
    if (existing) return serializeOne(ctx, existing);
  }

  const mentions = await validateMentions(ctx, channelId, dto.content, dto.mentions);
  const data: Record<string, unknown> = { ...(dto.data ?? {}) };
  if (mentions.length) data.mentions = mentions;

  let saved: MessageRow;
  try {
    saved = await prisma.qcMessage.create({
      data: {
        orgId: ctx.orgId,
        channelId,
        senderId: ctx.userId,
        // Stamp authorship from the resolved actor (Requirement 4). Defaults to
        // human; an agent-authored message carries ai_agent + its agentRunId.
        actorType: actor.actorType ?? "human",
        agentRunId: actor.agentRunId ?? null,
        type,
        content: dto.content,
        data: Object.keys(data).length ? (data as Prisma.InputJsonValue) : undefined,
        parentMessageId: dto.parentMessageId ?? null,
        clientMessageId: dto.clientMessageId ?? null,
        reactions: {},
      },
    });
  } catch (e) {
    // Lost the race on the unique (channelId, clientMessageId) — return the winner.
    if (
      dto.clientMessageId &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const existing = await prisma.qcMessage.findFirst({
        where: { channelId, clientMessageId: dto.clientMessageId },
      });
      if (existing) return serializeOne(ctx, existing);
    }
    throw e;
  }

  const message = await serializeOne(ctx, saved);
  await publishFanout({ orgId: ctx.orgId, channelId, event: "message", payload: message });
  indexUpsert(ctx.orgId, saved);
  // Notifications (S10a): mint per-recipient rows + per-user realtime signal.
  // AWAITED (S13 Bug 5) so the notification is reliably persisted before the
  // response returns — a fire-and-forget could be dropped when the request
  // function is frozen on a serverless host. deliverForMessage is internally
  // best-effort (never throws), so this can't fail the send.
  await notifications.deliverForMessage(ctx.orgId, channelId, ctx.userId, saved, mentions);
  return message;
}

/**
 * Re-serialize a message and fan it out as `message_update` (S15a). Used by the
 * RSVP path so the in-chat meeting card refreshes live for everyone — reusing
 * the existing message-patch path instead of a bespoke event.
 */
export async function republishMessage(ctx: OrgContext, messageId: string): Promise<void> {
  const row = await prisma.qcMessage.findFirst({ where: { id: messageId, orgId: ctx.orgId } });
  if (!row) return;
  const message = await serializeOne(ctx, row);
  await publishFanout({
    orgId: ctx.orgId,
    channelId: row.channelId,
    event: "message_update",
    payload: message,
  });
}

export async function listPinned(ctx: OrgContext, channelId: string): Promise<MessageDto[]> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const rows = await prisma.qcMessage.findMany({
    where: { orgId: ctx.orgId, channelId, isPinned: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return serializeMany(ctx, rows);
}

// ============================================================================
// Mutations on a message by id
// ============================================================================

async function getMessageOr404(ctx: OrgContext, messageId: string): Promise<MessageRow> {
  const msg = await prisma.qcMessage.findFirst({ where: { id: messageId, orgId: ctx.orgId } });
  if (!msg) throw new HttpError(404, "Message not found");
  return msg;
}

export async function toggleReaction(
  ctx: OrgContext,
  messageId: string,
  emoji: string,
): Promise<{
  message: MessageDto;
  channelId: string;
  added: boolean;
  messageSenderId: string | null;
}> {
  const msg = await getMessageOr404(ctx, messageId);
  await assertMembership(ctx.orgId, msg.channelId, ctx.userId);

  const reactions: Record<string, string[]> =
    msg.reactions && typeof msg.reactions === "object"
      ? (msg.reactions as Record<string, string[]>)
      : {};
  const userIds = Array.isArray(reactions[emoji]) ? [...reactions[emoji]!] : [];
  const idx = userIds.indexOf(ctx.userId);
  let added: boolean;
  if (idx >= 0) {
    userIds.splice(idx, 1);
    if (userIds.length === 0) delete reactions[emoji];
    else reactions[emoji] = userIds;
    added = false;
  } else {
    reactions[emoji] = [...userIds, ctx.userId];
    added = true;
  }

  const updated = await prisma.qcMessage.update({
    where: { id: msg.id },
    data: { reactions },
  });
  const message = await serializeOne(ctx, updated);
  await publishFanout({
    orgId: ctx.orgId,
    channelId: msg.channelId,
    event: "reaction",
    payload: message,
  });
  // Notifications (S10a): notify the message's original sender on a NEW reaction
  // (not on un-react, not on self-reaction). Best-effort, fire-and-forget.
  if (added && msg.senderId && msg.senderId !== ctx.userId) {
    void notifications
      .deliverForReaction(ctx.orgId, msg.channelId, msg.senderId, ctx.userId, emoji, updated)
      .catch(() => undefined);
  }
  return { message, channelId: msg.channelId, added, messageSenderId: msg.senderId };
}

export async function forward(
  ctx: OrgContext,
  sourceMessageId: string,
  channelIds: string[],
  note?: string,
): Promise<{ delivered: string[] }> {
  const source = await getMessageOr404(ctx, sourceMessageId);
  // `ApprovalRequest` joins the unforwardable list: the card is bound to the
  // request that produced it, so a copy would put a live-looking proposal in a
  // channel where it means nothing — and would show Approve buttons there to
  // whoever originally asked, since `viewerMayAct` keys off the snapshot.
  if (
    source.type === "Delete" ||
    source.type === "SystemActivity" ||
    source.type === "ApprovalRequest"
  ) {
    throw new HttpError(403, "Cannot forward this message");
  }
  await assertMembership(ctx.orgId, source.channelId, ctx.userId);

  // `senderName` is the ORIGINAL author (not the forwarder) — that's correct.
  // Also capture the source channel name so the label can read "… in #channel".
  const senderName = source.senderId ? await displayNameOf(source.senderId) : "Unknown";
  const sourceChannel = await prisma.qcChannel.findFirst({
    where: { id: source.channelId, orgId: ctx.orgId },
    select: { name: true },
  });
  const forwardedFrom = {
    channelId: source.channelId,
    senderId: source.senderId,
    senderName,
    sourceChannelName: sourceChannel?.name ?? null,
  };

  const sourceData =
    source.data && typeof source.data === "object" && !Array.isArray(source.data)
      ? (source.data as Record<string, unknown>)
      : {};

  const delivered: string[] = [];
  for (const targetId of channelIds) {
    // Skip targets the caller isn't a member of rather than failing the batch.
    const isMember = await assertMembership(ctx.orgId, targetId, ctx.userId)
      .then(() => true)
      .catch(() => false);
    if (!isMember) continue;

    if (note && note.trim()) {
      const noteMsg = await prisma.qcMessage.create({
        data: {
          orgId: ctx.orgId,
          channelId: targetId,
          senderId: ctx.userId,
          type: "Text",
          content: note.trim(),
          reactions: {},
        },
      });
      await publishFanout({
        orgId: ctx.orgId,
        channelId: targetId,
        event: "message",
        payload: await serializeOne(ctx, noteMsg),
      });
    }

    const copy = await prisma.qcMessage.create({
      data: {
        orgId: ctx.orgId,
        channelId: targetId,
        senderId: ctx.userId,
        type: source.type,
        content: source.content,
        data: { ...sourceData, forwardedFrom },
        reactions: {},
      },
    });
    await publishFanout({
      orgId: ctx.orgId,
      channelId: targetId,
      event: "message",
      payload: await serializeOne(ctx, copy),
    });
    indexUpsert(ctx.orgId, copy);
    delivered.push(targetId);
  }
  return { delivered };
}

export async function setPinned(
  ctx: OrgContext,
  messageId: string,
  pinned: boolean,
): Promise<MessageDto> {
  const msg = await getMessageOr404(ctx, messageId);
  if (msg.type === "Delete") throw new HttpError(403, "Cannot pin a deleted message");
  await assertMembership(ctx.orgId, msg.channelId, ctx.userId);
  const updated = await prisma.qcMessage.update({
    where: { id: msg.id },
    data: { isPinned: pinned },
  });
  const message = await serializeOne(ctx, updated);
  await publishFanout({
    orgId: ctx.orgId,
    channelId: msg.channelId,
    event: "message_update",
    payload: message,
  });
  return message;
}

export async function editMessage(
  ctx: OrgContext,
  messageId: string,
  content: string,
  rawMentions?: MentionRefInput[],
): Promise<MessageDto> {
  const msg = await getMessageOr404(ctx, messageId);
  if (msg.senderId !== ctx.userId) throw new HttpError(403, "You can only edit your own messages");
  if (msg.type === "Delete" || msg.type === "SystemActivity") {
    throw new HttpError(403, "This message cannot be edited");
  }
  // QC_007: edits are only allowed inside a fixed window after posting. Delete has
  // no such window — this gate is edit-only, by design.
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new HttpError(403, "Edit window has passed");
  }
  const trimmed = (content ?? "").trim();
  if (!trimmed) throw new HttpError(403, "Message cannot be empty");
  await assertMembership(ctx.orgId, msg.channelId, ctx.userId);

  const existingData =
    msg.data && typeof msg.data === "object" && !Array.isArray(msg.data)
      ? (msg.data as Record<string, unknown>)
      : {};
  const mentionsInput: MentionRefInput[] =
    rawMentions !== undefined
      ? rawMentions
      : Array.isArray(existingData.mentions)
        ? (existingData.mentions as MentionRefInput[])
        : [];
  const mentions = await validateMentions(ctx, msg.channelId, trimmed, mentionsInput);

  const data: Record<string, unknown> = { ...existingData };
  if (mentions.length) data.mentions = mentions;
  else delete data.mentions;

  const updated = await prisma.qcMessage.update({
    where: { id: msg.id },
    data: {
      content: trimmed,
      data: Object.keys(data).length ? (data as Prisma.InputJsonValue) : undefined,
      editedAt: new Date(),
    },
  });
  const message = await serializeOne(ctx, updated);
  await publishFanout({
    orgId: ctx.orgId,
    channelId: msg.channelId,
    event: "message_update",
    payload: message,
  });
  indexUpsert(ctx.orgId, updated);
  return message;
}

export async function deleteForEveryone(ctx: OrgContext, messageId: string): Promise<MessageDto> {
  const msg = await getMessageOr404(ctx, messageId);
  if (msg.senderId !== ctx.userId)
    throw new HttpError(403, "You can only delete your own messages");
  const updated = await prisma.qcMessage.update({
    where: { id: msg.id },
    data: { type: "Delete", content: "", data: Prisma.DbNull, reactions: {} },
  });
  const message = await serializeOne(ctx, updated);
  await publishFanout({
    orgId: ctx.orgId,
    channelId: msg.channelId,
    event: "message_update",
    payload: message,
  });
  void emitIndexEvent({
    op: "delete",
    orgId: ctx.orgId,
    app: "quikchat",
    entity: "message",
    id: msg.id,
    channelId: msg.channelId,
  });
  return message;
}
