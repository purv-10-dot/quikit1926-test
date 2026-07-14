// ============================================================================
// Clean wire contract (Step 2). These are the typed shapes the rebuilt client
// consumes — the original Mongo-shaped format (`_id`, `sender_id`,
// `data.data_text`, …) is intentionally dropped. Keep these names STABLE.
// ============================================================================

/**
 * Stable id of the synthetic AI assistant participant (S12). Surfaced here so
 * both server (delivery/membership) and client (receipt math) agree on it, and
 * so `ai_agent` members can be excluded from read/delivered tick denominators.
 */
export const ASSISTANT_BOT_USER_ID = "quikchat-assistant-bot";

export type ThemePref = "system" | "light" | "dark";
export interface UiPrefsDto {
  theme: ThemePref;
}

export type ChannelType = "dm" | "group";
export type ChannelVisibility = "public" | "private";
export type MessageType = "Text" | "Media" | "SystemActivity" | "Delete" | "Meeting" | "Call";
export type ActorType = "human" | "ai_agent";
export type MemberRole = "admin" | "member";

export interface PublicUser {
  id: string;
  /** Maps from the stub `User.username` (later the real user's display field). */
  displayName: string;
  avatarUrl: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface Mention {
  userId: string;
  displayName: string;
  offsetStart: number;
  offsetEnd: number;
}

export interface ParentPreview {
  id: string;
  senderId: string | null;
  type: string;
  content: string;
}

export interface MessageDto {
  id: string;
  channelId: string;
  senderId: string | null;
  actorType: ActorType;
  type: MessageType;
  content: string;
  data: Record<string, unknown> | null;
  parentMessageId: string | null;
  parentPreview: ParentPreview | null;
  isPinned: boolean;
  reactions: ReactionSummary[];
  mentions: Mention[];
  /** Client-generated idempotency id (present when the sender supplied one). */
  clientMessageId?: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface ChannelLastMessage {
  id: string;
  type: string;
  content: string;
  senderId: string | null;
  createdAt: string;
}

export interface ChannelListItem {
  channelId: string;
  name: string | null;
  avatarUrl: string | null;
  type: ChannelType;
  visibility: ChannelVisibility;
  isPriority: boolean;
  unreadCount: number;
  lastActivityAt: string;
  members: PublicUser[];
  /** Per-member `lastReadAt`, excluding self. */
  memberReadAt: Record<string, string | null>;
  /** Per-member `lastDeliveredAt`, excluding self (S14a — drives delivery ticks). */
  memberDeliveredAt: Record<string, string | null>;
  lastMessage: ChannelLastMessage | null;
}

export interface ChannelList {
  priority: ChannelListItem[];
  recent: ChannelListItem[];
}

export interface ChannelMemberDto extends PublicUser {
  role: MemberRole;
  joinedAt: string;
}

export interface DiscoverChannelItem {
  channelId: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  visibility: ChannelVisibility;
  isMember: boolean;
}

export interface InviteDto {
  id: string;
  code: string;
  channelId: string;
  channelName: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
  createdById: string | null;
  revokedAt: string | null;
}

export interface InvitePreview {
  channelId: string;
  name: string | null;
  description: string | null;
  visibility: ChannelVisibility;
  memberCount: number;
  expiresAt: string | null;
  /** null = unlimited. */
  remainingUses: number | null;
}

// --- Input shapes (validated in the service layer) ---

export interface MentionRefInput {
  /** A user UUID, or the literal `"everyone"`. */
  userId: string;
  offsetStart: number;
  offsetEnd: number;
}

export interface CreateChannelInput {
  type: ChannelType;
  visibility?: ChannelVisibility;
  name?: string;
  description?: string;
  memberIds?: string[];
}

export interface SendMessageInput {
  content: string;
  type?: "Text" | "Media" | "SystemActivity" | "Meeting" | "Call";
  data?: Record<string, unknown>;
  parentMessageId?: string;
  mentions?: MentionRefInput[];
  /** Client-generated UUID for idempotent sends (retries return the same row). */
  clientMessageId?: string;
}

export interface EditMessageInput {
  content: string;
  mentions?: MentionRefInput[];
}

export interface ForwardMessageInput {
  channelIds: string[];
  note?: string;
}

export interface CreateInviteInput {
  maxUses?: number;
  expiresInMinutes?: number;
}

// ============================================================================
// Notifications (S10a)
// ============================================================================

export type NotificationLevel = "all" | "mentions" | "none";
export type NotificationType = "mention" | "dm" | "keyword" | "reaction" | "thread_reply";

/** Serialized activity-feed row — the exact shape the bell/feed/toast consume. */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  preview: string;
  meta: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

/**
 * The realtime `notification` event payload: a serialized row plus a transient
 * `desktop` flag telling the client whether to ALSO fire an OS-level popup
 * (the row itself always updates the in-app bell/badge regardless).
 */
export interface NotificationRealtimePayload extends NotificationDto {
  desktop: boolean;
}

export interface NotificationSettingsDto {
  defaultChannelLevel: NotificationLevel;
  dmsLevel: NotificationLevel;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  emailEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string | null;
  dndEnd: string | null;
  snoozedUntil: string | null;
  priorityDuringDnd: boolean;
}

export interface NotificationPreferenceDto {
  channelId: string;
  /** null = inherit the user's default level. */
  level: NotificationLevel | null;
  mutedUntil: string | null;
}

export interface NotificationKeywordDto {
  id: string;
  keyword: string;
  createdAt: string;
}

// ============================================================================
// Calendar & meetings (S15a)
// ============================================================================

export type RsvpStatus = "accepted" | "declined" | "tentative";
export type AttendeeRsvp = "needs_action" | RsvpStatus;
export type MeetingStatus = "scheduled" | "cancelled";

/** A busy interval (UTC ISO) for one user — what the free/busy grid renders. */
export interface FreeBusyInterval {
  start: string;
  end: string;
}

/** GET /api/calendar/free-busy response: busy blocks keyed by userId. */
export interface FreeBusyDto {
  from: string;
  to: string;
  /** userId → busy intervals over [from, to]. Absent from `busy` if unknown. */
  busy: Record<string, FreeBusyInterval[]>;
  /**
   * userIds whose availability the active provider can't see (S15b): a Google
   * account outside the single-account's visibility, or an unconnected
   * Microsoft user. Rendered as a distinct "unknown" band, never as free.
   */
  unknown: string[];
}

export type CalendarProviderId = "stub" | "google" | "microsoft";

/** GET /api/calendar/connection — the active provider + the caller's link state. */
export interface CalendarConnectionDto {
  /** The active calendar provider for this deployment. */
  provider: CalendarProviderId;
  /** True when this provider requires a per-user connect (Microsoft). */
  requiresUserConnect: boolean;
  /** The caller's connection, if any (Microsoft). */
  connected: boolean;
  /** The connected mailbox, when connected. */
  email: string | null;
}

export interface MeetingAttendeeDto {
  user: PublicUser;
  email: string;
  rsvp: AttendeeRsvp;
}

/**
 * The chat-facing meeting projection. Serialized into a `Meeting` message's
 * `data.meeting` so the card renders (and live-updates via message_update) with
 * no extra client fetch. Times are UTC ISO — render local.
 */
export interface MeetingDto {
  id: string;
  channelId: string;
  organizerId: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  joinUrl: string | null;
  status: MeetingStatus;
  attendees: MeetingAttendeeDto[];
}

/** POST /api/channels/[id]/meetings body. */
export interface CreateMeetingInput {
  title: string;
  description?: string;
  start: string;
  end: string;
  attendeeUserIds: string[];
  conferencing: boolean;
  /** Idempotent send id for the announcing Meeting message. */
  clientMessageId?: string;
}

export interface RsvpInput {
  status: RsvpStatus;
}

// --- Personal calendar (S17) ---
export interface CalendarDto {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  visible: boolean;
  sortOrder: number;
}

export type CalendarEventSource = "event" | "meeting";

export interface CalendarEventDto {
  id: string;
  calendarId: string | null; // null for a meeting overlay row
  source: CalendarEventSource;
  title: string;
  description: string | null;
  location: string | null;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  color: string; // resolved: event.color ?? calendar.color ?? default
  joinUrl: string | null;
  channelId: string | null; // meeting overlay only
  editable: boolean; // false for meeting overlay
}

export interface CreateCalendarEventInput {
  calendarId?: string; // caller's default calendar if omitted
  title: string;
  description?: string;
  location?: string;
  start: string; // ISO
  end: string; // ISO
  allDay?: boolean;
  color?: string;
  joinUrl?: string;
}

export interface UpdateCalendarEventInput {
  calendarId?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  start?: string;
  end?: string;
  allDay?: boolean;
  color?: string | null;
  joinUrl?: string | null;
  status?: "confirmed" | "cancelled";
}

export interface UpdateCalendarInput {
  visible?: boolean;
  name?: string;
  color?: string;
  sortOrder?: number;
}
