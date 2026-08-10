import type {
  CallHistoryItem,
  ChannelList,
  ChannelListItem,
  ChannelMemberDto,
  CreateChannelInput,
  CreateInviteInput,
  DiscoverChannelItem,
  InviteDto,
  InvitePreview,
  IngestResult,
  IngestVisibility,
  CalendarConnectionDto,
  CalendarDto,
  CalendarEventDto,
  CreateCalendarEventInput,
  CreateMeetingInput,
  FreeBusyDto,
  MeetingDto,
  UpdateCalendarEventInput,
  UpdateCalendarInput,
  MentionRefInput,
  MessageDto,
  RsvpStatus,
  NotificationDto,
  NotificationKeywordDto,
  NotificationLevel,
  NotificationPreferenceDto,
  NotificationSettingsDto,
  PublicUser,
  ThemePref,
  UiPrefsDto,
  UpdateChannelInput,
} from "@/lib/shared";
import type { SetStatus } from "@/lib/presence-store";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
  return (await res.json().catch(() => ({}))) as T;
}

export function fetchChannels(): Promise<ChannelList> {
  return getJson<ChannelList>("/api/channels");
}

/**
 * History page size. Exported because end-of-history detection compares a
 * returned page's length against it — if the two drift apart, scroll-back
 * either stops one page early or never stops at all.
 */
export const MESSAGES_PAGE_SIZE = 30;

export function fetchMessages(channelId: string, before?: string): Promise<MessageDto[]> {
  const qs = new URLSearchParams({ limit: String(MESSAGES_PAGE_SIZE) });
  if (before) qs.set("before", before);
  return getJson<MessageDto[]>(`/api/channels/${channelId}/messages?${qs.toString()}`);
}

export async function sendMessage(
  channelId: string,
  body: {
    content: string;
    type?: "Text" | "Media" | "SystemActivity";
    data?: Record<string, unknown>;
    mentions?: MentionRefInput[];
    parentMessageId?: string;
    clientMessageId?: string;
  },
): Promise<MessageDto> {
  const res = await fetch(`/api/channels/${channelId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`send → ${res.status}`);
  return (await res.json()) as MessageDto;
}

export async function markChannelReadApi(channelId: string): Promise<void> {
  await fetch(`/api/channels/${channelId}/read`, { method: "PATCH", credentials: "include" });
}

/** Advance the caller's delivery watermark (S14a). Best-effort, monotonic server-side. */
export async function markChannelDeliveredApi(channelId: string): Promise<void> {
  await fetch(`/api/channels/${channelId}/delivered`, { method: "PATCH", credentials: "include" });
}

// --- per-user UI prefs (S14b) ---

export function fetchUiPrefs(): Promise<UiPrefsDto> {
  return getJson<UiPrefsDto>("/api/me/ui-prefs");
}

export function patchUiPrefs(patch: { theme: ThemePref }): Promise<UiPrefsDto> {
  return send<UiPrefsDto>("/api/me/ui-prefs", "PATCH", patch);
}

// --- rich presence set-status ---

export interface MyPresenceDto {
  status: SetStatus;
  statusMessage: string | null;
  statusExpiresAt: string | null;
  /** Mutual last-seen visibility (Privacy settings). Default on. */
  shareLastSeen: boolean;
}

export function fetchMyPresence(): Promise<MyPresenceDto> {
  return getJson<MyPresenceDto>("/api/me/presence");
}

/** At least one of `status` / `shareLastSeen` must be present (400 otherwise). */
export function updateMyPresence(patch: {
  status?: SetStatus;
  statusMessage?: string | null;
  /** Absolute ISO instant to auto-revert (client-computed); null = until changed. */
  expiresAt?: string | null;
  shareLastSeen?: boolean;
}): Promise<MyPresenceDto> {
  return send<MyPresenceDto>("/api/me/presence", "PUT", patch);
}

/**
 * The DM peer's last-seen instant, or null when it must not be shown (mutual
 * opt-out / appear_offline / never recorded — indistinguishable by design).
 */
export function fetchChannelLastSeen(channelId: string): Promise<{ lastSeen: string | null }> {
  return getJson<{ lastSeen: string | null }>(`/api/channels/${channelId}/last-seen`);
}

// --- message actions (S05) ---

export function toggleReactionApi(messageId: string, emoji: string): Promise<MessageDto> {
  return send<MessageDto>(`/api/messages/${messageId}/reactions`, "POST", { emoji });
}

export function editMessageApi(
  messageId: string,
  body: { content: string; mentions?: MentionRefInput[] },
): Promise<MessageDto> {
  return send<MessageDto>(`/api/messages/${messageId}`, "PATCH", body);
}

export function deleteMessageApi(messageId: string): Promise<MessageDto> {
  return send<MessageDto>(`/api/messages/${messageId}`, "DELETE");
}

export function forwardMessageApi(
  messageId: string,
  body: { channelIds: string[]; note?: string },
): Promise<{ delivered: string[] }> {
  return send<{ delivered: string[] }>(`/api/messages/${messageId}/forward`, "POST", body);
}

export function setMessagePinApi(messageId: string, pinned: boolean): Promise<MessageDto> {
  return send<MessageDto>(`/api/messages/${messageId}/pin`, "PATCH", { pinned });
}

export function fetchPinned(channelId: string): Promise<MessageDto[]> {
  return getJson<MessageDto[]>(`/api/channels/${channelId}/messages/pinned`);
}

/** Terminal call history for the Calls → History pane (newest first). */
export function fetchCallHistory(): Promise<CallHistoryItem[]> {
  return getJson<CallHistoryItem[]>("/api/calls/history");
}

export function fetchMembers(channelId: string): Promise<ChannelMemberDto[]> {
  return getJson<ChannelMemberDto[]>(`/api/channels/${channelId}/members`);
}

export function fetchChannelDetail(channelId: string): Promise<ChannelListItem> {
  return getJson<ChannelListItem>(`/api/channels/${channelId}`);
}

// --- creation / discovery / membership / invites (S06) ---

export function fetchOrgUsers(opts: {
  q?: string;
  excludeChannelId?: string;
  excludeSelf?: boolean;
}): Promise<PublicUser[]> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set("q", opts.q);
  if (opts.excludeChannelId) qs.set("excludeChannelId", opts.excludeChannelId);
  if (opts.excludeSelf) qs.set("excludeSelf", "1");
  return getJson<PublicUser[]>(`/api/users?${qs.toString()}`);
}

export function createChannel(body: CreateChannelInput): Promise<ChannelListItem> {
  return send<ChannelListItem>("/api/channels", "POST", body);
}

/** Open (find-or-create) the caller's AI-chat singleton. Idempotent. */
export function openAiChat(): Promise<ChannelListItem> {
  return send<ChannelListItem>("/api/channels/ai", "POST");
}

/**
 * Stage 3 "Add to KB": ingest an attached document into the knowledge base. The
 * client sends the durable `storageKey` it owns (the relay authorizes it to the
 * channel + sets sourceFileId). Throws an Error carrying the server `code` on
 * failure so the caller can toast a real message.
 */
export async function ingestDocument(
  channelId: string,
  body: {
    storageKey: string;
    filename: string;
    visibility: Extract<IngestVisibility, "PRIVATE" | "ORG">;
    /** The Media message being ingested — lets the server persist the KB marker
     * on that row by primary key (Option-B auto-scope). */
    messageId?: string;
  },
): Promise<IngestResult> {
  const res = await fetch(`/api/channels/${channelId}/ingest`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(j.error ?? `ingest → ${res.status}`) as Error & { code?: string };
    err.code = j.code;
    throw err;
  }
  return (await res.json()) as IngestResult;
}

/**
 * The channel's persisted KB-ingested source-file ids (Stage 3 auto-scope).
 * Fetched on AI-chat mount to seed the conversation's retrieval scope so it
 * survives a page reload.
 */
export async function fetchKbDocs(channelId: string): Promise<string[]> {
  const res = await getJson<{ sourceFileIds: string[] }>(`/api/channels/${channelId}/kb-docs`);
  return res.sourceFileIds;
}

export function discoverChannels(q?: string): Promise<DiscoverChannelItem[]> {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  return getJson<DiscoverChannelItem[]>(`/api/channels/discover?${qs.toString()}`);
}

export function joinChannel(channelId: string): Promise<ChannelListItem> {
  return send<ChannelListItem>(`/api/channels/${channelId}/join`, "POST");
}

export function listInvites(channelId: string): Promise<InviteDto[]> {
  return getJson<InviteDto[]>(`/api/channels/${channelId}/invites`);
}

export function createInvite(channelId: string, body: CreateInviteInput): Promise<InviteDto> {
  return send<InviteDto>(`/api/channels/${channelId}/invites`, "POST", body);
}

export function revokeInvite(channelId: string, inviteId: string): Promise<{ revoked: true }> {
  return send<{ revoked: true }>(`/api/channels/${channelId}/invites/${inviteId}`, "DELETE");
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  // Public — works without a session.
  const res = await fetch(`/api/invites/${code}`);
  if (!res.ok) throw new Error(`preview → ${res.status}`);
  return (await res.json()) as InvitePreview;
}

export function acceptInvite(code: string): Promise<ChannelListItem> {
  return send<ChannelListItem>(`/api/invites/${code}/accept`, "POST");
}

export function addMember(channelId: string, userId: string): Promise<ChannelListItem> {
  return send<ChannelListItem>(`/api/channels/${channelId}/members`, "POST", { userId });
}

export function removeMember(channelId: string, userId: string): Promise<{ removed: true }> {
  return send<{ removed: true }>(`/api/channels/${channelId}/members/${userId}`, "DELETE");
}

/** Edit group details (name / description / avatar). Admin-gated server-side. */
export function updateChannel(
  channelId: string,
  patch: UpdateChannelInput,
): Promise<ChannelListItem> {
  return send<ChannelListItem>(`/api/channels/${channelId}`, "PATCH", patch);
}

/** Delete the group for everyone (dedicated route — NOT the leave DELETE). */
export function deleteChannel(channelId: string): Promise<{ deleted: true }> {
  return send<{ deleted: true }>(`/api/channels/${channelId}/delete`, "POST");
}

/**
 * Leave a channel (self-removal). Plain `send()` isn't used here because it
 * discards the response body on failure — a future server-side refusal (e.g.
 * a last-admin guard) needs its real message surfaced, not a generic
 * "DELETE ... → 400".
 */
export async function leaveChannel(channelId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/channels/${channelId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
  if (!res.ok) throw new Error(body.error ?? `leave → ${res.status}`);
  return { deleted: !!body.deleted };
}

/**
 * Pin / unpin a conversation for the CALLING user (QC_010). Per-member state on
 * `qcChannelMember.isPinned` — it moves the channel between the list's
 * `priority` and `recent` buckets. Not fanned out (nobody else's list changes),
 * so callers refetch `["channels"]` themselves.
 */
export function pinChannel(channelId: string, pinned: boolean): Promise<{ pinned: boolean }> {
  return send<{ pinned: boolean }>(`/api/channels/${channelId}/pin`, "PATCH", { pinned });
}

export async function setMemberRole(
  channelId: string,
  userId: string,
  role: "admin" | "member",
): Promise<{ role: string } | { error: string }> {
  const res = await fetch(`/api/channels/${channelId}/members/${userId}/role`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const body = (await res.json().catch(() => ({}))) as { role?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `role → ${res.status}`);
  return body as { role: string };
}

// ============================================================================
// Notifications (S10b — consumes the S10a backend)
// ============================================================================

export interface NotificationFeedPage {
  items: NotificationDto[];
  unreadCount: number;
}

export function fetchNotifications(opts: {
  limit?: number;
  before?: string;
  unreadOnly?: boolean;
}): Promise<NotificationFeedPage> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.before) qs.set("before", opts.before);
  if (opts.unreadOnly) qs.set("unreadOnly", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<NotificationFeedPage>(`/api/notifications${suffix}`);
}

export function fetchUnreadCount(): Promise<{ count: number }> {
  return getJson<{ count: number }>("/api/notifications/unread-count");
}

export function fetchUnreadByChannel(): Promise<{
  byChannel: Record<string, number>;
  total: number;
}> {
  return getJson<{ byChannel: Record<string, number>; total: number }>(
    "/api/notifications/unread-by-channel",
  );
}

export function markNotificationsReadApi(ids: string[]): Promise<{ unreadCount: number }> {
  return send<{ unreadCount: number }>("/api/notifications/read", "POST", { ids });
}

export function markAllNotificationsReadApi(): Promise<{ unreadCount: number }> {
  return send<{ unreadCount: number }>("/api/notifications/read-all", "POST");
}

export function markChannelNotificationsReadApi(
  channelId: string,
): Promise<{ affected: number; unreadCount: number }> {
  return send<{ affected: number; unreadCount: number }>(
    "/api/notifications/read-by-channel",
    "POST",
    { channelId },
  );
}

export function clearNotificationsApi(): Promise<{ unreadCount: number }> {
  return send<{ unreadCount: number }>("/api/notifications", "DELETE");
}

// --- settings / keywords / per-channel preference (S10c config UI) ---

export function fetchNotificationSettings(): Promise<NotificationSettingsDto> {
  return getJson<NotificationSettingsDto>("/api/notifications/settings");
}

export function patchNotificationSettings(
  patch: Partial<NotificationSettingsDto>,
): Promise<NotificationSettingsDto> {
  return send<NotificationSettingsDto>("/api/notifications/settings", "PATCH", patch);
}

export function fetchKeywords(): Promise<NotificationKeywordDto[]> {
  return getJson<NotificationKeywordDto[]>("/api/notifications/keywords");
}

export function addKeywordApi(keyword: string): Promise<NotificationKeywordDto> {
  return send<NotificationKeywordDto>("/api/notifications/keywords", "POST", { keyword });
}

export function removeKeywordApi(id: string): Promise<{ ok: true }> {
  return send<{ ok: true }>(`/api/notifications/keywords/${id}`, "DELETE");
}

export function fetchChannelNotificationPreference(
  channelId: string,
): Promise<NotificationPreferenceDto> {
  return getJson<NotificationPreferenceDto>(`/api/channels/${channelId}/notification-preference`);
}

export function patchChannelNotificationPreference(
  channelId: string,
  patch: { level?: NotificationLevel | null; mutedUntil?: string | null },
): Promise<NotificationPreferenceDto> {
  return send<NotificationPreferenceDto>(
    `/api/channels/${channelId}/notification-preference`,
    "PATCH",
    patch,
  );
}

// --- media uploads (S11) ---

export interface UploadTargetResponse {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  objectPath: string;
  maxBytes: number;
  expiresAt: string;
}

export function signUploadApi(body: {
  channelId: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<UploadTargetResponse> {
  return send<UploadTargetResponse>("/api/uploads/sign", "POST", body);
}

// --- calendar & meetings (S15a) ---

export function fetchFreeBusy(userIds: string[], from: string, to: string): Promise<FreeBusyDto> {
  const qs = new URLSearchParams({ userIds: userIds.join(","), from, to });
  return getJson<FreeBusyDto>(`/api/calendar/free-busy?${qs.toString()}`);
}

export async function createMeetingApi(
  channelId: string,
  body: CreateMeetingInput,
): Promise<{ meeting: MeetingDto; message: MessageDto }> {
  const res = await fetch(`/api/channels/${channelId}/meetings`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Surface the server's reason (e.g. "Not a member of this channel") so the
    // scheduling modal can show it instead of a generic failure (S15c).
    const reason = await res
      .json()
      .then((j: { error?: string }) => j.error)
      .catch(() => null);
    throw new Error(reason || `Could not schedule the meeting (${res.status})`);
  }
  return (await res.json()) as { meeting: MeetingDto; message: MessageDto };
}

export function rsvpMeetingApi(meetingId: string, status: RsvpStatus): Promise<MeetingDto> {
  return send<MeetingDto>(`/api/meetings/${meetingId}/rsvp`, "PATCH", { status });
}

export function fetchCalendarConnection(): Promise<CalendarConnectionDto> {
  return getJson<CalendarConnectionDto>("/api/calendar/connection");
}

/** The caller's meetings (organizer or attendee) in [from,to] — planner view. */
export function fetchMeetings(from: string, to: string): Promise<MeetingDto[]> {
  const qs = new URLSearchParams({ from, to });
  return getJson<MeetingDto[]>(`/api/calendar/meetings?${qs.toString()}`);
}

/** Per-user OAuth connect (Microsoft) is a full-page nav (server 302 → MS). */
export const MICROSOFT_CONNECT_URL = "/api/calendar/microsoft/connect";

export function disconnectMicrosoftApi(): Promise<{ disconnected: true }> {
  return send<{ disconnected: true }>("/api/calendar/microsoft/connect", "DELETE");
}

// --- personal calendar & events (S17) ---

export function fetchCalendars(): Promise<CalendarDto[]> {
  return getJson<CalendarDto[]>("/api/calendar/calendars");
}
export function patchCalendar(id: string, patch: UpdateCalendarInput): Promise<CalendarDto> {
  return send<CalendarDto>(`/api/calendar/calendars/${id}`, "PATCH", patch);
}
export function fetchCalendarEvents(from: string, to: string): Promise<CalendarEventDto[]> {
  const qs = new URLSearchParams({ from, to });
  return getJson<CalendarEventDto[]>(`/api/calendar/events?${qs.toString()}`);
}
export function createCalendarEvent(input: CreateCalendarEventInput): Promise<CalendarEventDto> {
  return send<CalendarEventDto>("/api/calendar/events", "POST", input);
}
export function updateCalendarEvent(
  id: string,
  patch: UpdateCalendarEventInput,
): Promise<CalendarEventDto> {
  return send<CalendarEventDto>(`/api/calendar/events/${id}`, "PATCH", patch);
}
export function deleteCalendarEvent(id: string): Promise<{ deleted: true }> {
  return send<{ deleted: true }>(`/api/calendar/events/${id}`, "DELETE");
}
