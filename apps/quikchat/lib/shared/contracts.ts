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

export type ChannelType = "dm" | "group" | "ai";
export type ChannelVisibility = "public" | "private";
export type MessageType =
  | "Text"
  | "Media"
  | "SystemActivity"
  | "Delete"
  | "Meeting"
  | "Call"
  /**
   * A write the assistant parked for approval, persisted so the channel keeps a
   * trace of it. SERVER-WRITTEN ONLY — deliberately absent from
   * `SendMessageInput.type` below, and rejected by `messages.send`. See the
   * allow-list there for why that matters more for this type than the others.
   */
  | "ApprovalRequest";
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
  description: string | null;
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

/**
 * Group-details patch (QC_008). Every field optional — only provided keys are
 * changed. `avatarUrl` carries the uploaded object's storage path (objectPath);
 * the server resolves it to a signed URL on read (mirrors message media).
 */
export interface UpdateChannelInput {
  name?: string;
  description?: string;
  avatarUrl?: string;
}

/**
 * Knowledge-base document visibility (Stage 3 ingest). `APP` is reserved for
 * Stage 4 (filing into a target app) — the relay's accepted enum permits it to
 * match the runtime, but Stage 3 never sends it (the UI offers only PRIVATE/ORG).
 */
export type IngestVisibility = "PRIVATE" | "APP" | "ORG";

/** Result of a successful `/ai/ingest` (Stage 3, sync). */
export interface IngestResult {
  sourceFileId: string;
  chunksStored: number;
  contentHash: string;
}

/**
 * One retrieval citation on a KB-backed assist turn (Stage 3 retrieval). Rides
 * on the `done` event ONLY when the KB was used; omitted entirely otherwise.
 * Rendered as an ephemeral source chip on the live turn — never persisted.
 * Single source of truth: both the runtime seam and the client import this.
 */
export interface AssistSource {
  sourceFileId: string;
  chunkIndex: number;
  snippet: string;
}

/**
 * How dangerous the proposed write is, as classified by the runtime.
 *
 * ⚠️ **AN UNRECOGNISED VALUE MUST BE TREATED AS THE HIGHEST RISK.** This union
 * exists for consumer DX and is deliberately **NOT** validated at runtime: the
 * runtime may add a fourth class before this type learns about it, and rejecting
 * an entire write proposal because of an unfamiliar label is a worse outcome
 * than rendering it conservatively. So a value outside this union will reach the
 * UI — whatever renders the approval card must default unknown to the
 * most-restrictive treatment (explicit confirmation, no one-click accept), never
 * to `soft_write`.
 *
 * Stated here rather than only in the card's brief, because the card is where
 * it would be forgotten.
 */
export type AssistRiskClass = "soft_write" | "medium_write" | "high_risk";

/**
 * A write the assistant proposes but will not perform without human approval.
 *
 * Arrives on the assist SSE stream as `{ type: "approval_needed", ... }` and is
 * **terminal** — one per stream, then the stream closes, exactly like `done` and
 * `error`.
 *
 * Single source of truth: both the runtime seam (`lib/server/runtime/types.ts`)
 * and the client reader (`lib/assist-client.ts`) import this. It previously
 * existed as a payload-less placeholder on the server and nothing on the client,
 * which is two descriptions of one frame waiting to drift.
 *
 * Field names are frozen camelCase, per the runtime contract.
 */
export interface AssistApprovalRequest {
  /** Runtime-owned id for this pending request. The only field we hard-require. */
  requestId: string;
  /** Which app the write targets, e.g. "quiktrack". */
  appId: string;
  /** The tool the assistant wants to run, e.g. "create_issue". */
  toolName: string;
  riskClass: AssistRiskClass;
  /**
   * Human-readable description of the proposed write, composed by the runtime.
   * Passed through UNTOUCHED — never interpreted, truncated or reformatted.
   */
  summary: string;
  /**
   * The tool's arguments. Arbitrary by design and typed loosely on purpose: we
   * relay it, we do not read it.
   */
  toolInput: Record<string, unknown>;
  /** ISO instant after which the request can no longer be approved. */
  expiresAt: string;
}

/**
 * One row from the runtime's approval ledger (`GET /ai/requests`).
 *
 * ── THREE THINGS THAT ARE EASY TO GET WRONG ────────────────────────────────
 *
 * 1. `toolInput` / `proposedOutput` / `result` are **NOT camelCased inside.**
 *    The KEY is camelCase; the OBJECT is the target app's own argument naming
 *    (`projectId`, `assigneeId`, whatever QuikTrack calls things). They are
 *    relayed byte-identical — never normalised, never reshaped — and typed no
 *    deeper than `Record<string, unknown>` on purpose. Typing the interior would
 *    be inventing a contract we do not own.
 *
 * 2. `mode` is **dead**. It is always `'copilot'` and carries no information.
 *    Typed so the payload round-trips honestly, and deliberately never surfaced
 *    or filtered on. Do not build a mode switch on it.
 *
 * 3. The list returns **terminal rows, not just pending** — `expired`,
 *    `rejected`, `executed` and `failed` from the last 24h, alongside all
 *    pending. Every row carries `status`, so one payload renders live and dead
 *    cards together. Filtering to `pending` in a consumer would reinstate the
 *    trace gap this change exists to close: a write that expired unactioned
 *    would vanish rather than showing as expired.
 *
 * `riskClass` reuses `AssistRiskClass` — see its note: an unrecognised value
 * must be treated as the HIGHEST risk, never as `soft_write`.
 */
export interface AssistApprovalRow {
  id: string;
  orgId: string;
  userId: string;
  appId: string;
  useCase: string;
  toolName: string;
  /** Target app's own argument names. Pass through untouched. */
  toolInput: Record<string, unknown>;
  /** Target app's own shape. Pass through untouched. */
  proposedOutput: Record<string, unknown> | null;
  riskClass: AssistRiskClass;
  /** Always "copilot". Dead field — never surface or filter on it. */
  mode: string;
  status: AssistApprovalStatus;
  decisionBy: string | null;
  decisionAt: string | null;
  executedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  error: string | null;
  traceId: string | null;
  /** Present once executed. Target app's own shape; pass through untouched. */
  result?: Record<string, unknown> | null;
  /**
   * The runtime's own sentence for what HAPPENED — "Created QTRK-903". Generated
   * deterministically (no LLM) and persisted on the row, so it is identical from
   * the list, the fetch-one and the approve response.
   *
   * ⚠️ OPTIONAL, and the optionality is not decoration. Rows created before the
   * runtime shipped this field do not have it, and they are exactly the rows
   * most likely to be read (a 24h ledger spans the deploy). A consumer that
   * assumes it is present renders a blank outcome on real historical data. Every
   * read site must fall back to the status-derived line, never to empty.
   *
   * Distinct from the proposal `summary`, which describes what is ABOUT to
   * happen and is still missing from this row — see the note on `toolName`.
   */
  outcomeSummary?: string | null;
}

/**
 * Lifecycle of an approval request.
 *
 * Same leniency rule as `AssistRiskClass`: NOT validated at runtime, because the
 * runtime may add a state before this type learns about it, and dropping a row
 * whose status we do not recognise would hide a real parked write. A consumer
 * seeing an unfamiliar status should render it as non-actionable rather than
 * discard it.
 *
 * ── WHY THIS UNION NEEDS NO NORMALISER, UNLIKE `AssistRiskClass` ────────────
 * The two leniency rules read alike and are enforced completely differently,
 * and the difference is structural rather than incidental.
 *
 * For `riskClass` the SAFE value lives inside the known set (`high_risk`), so an
 * unfamiliar value has to be actively MAPPED onto it — do nothing and it renders
 * unstyled, which reads as mild. It needs a normaliser, and it has one.
 *
 * For `status` the safe behaviour is "not actionable", and every gate is a
 * POSITIVE check for `"pending"` rather than a denylist of terminal states. An
 * unfamiliar value therefore falls to the safe side by construction: it is not
 * `"pending"`, so it is not actionable, at every gate independently. Adding a
 * state to this union is purely additive — nothing has to learn to reject it
 * first.
 *
 * Keep it that way. The moment a consumer switches to `status !== "executed" &&
 * status !== "rejected" && …`, an unknown state starts rendering as live and a
 * request nobody can action grows Approve/Reject buttons.
 */
export type AssistApprovalStatus =
  | "pending"
  | "expired"
  | "rejected"
  | "executed"
  | "failed"
  /**
   * The request was withdrawn out from under the user — the tenant disabled the
   * assistant module while it was parked. NOT `rejected`: a human declining and
   * a request being cancelled are different facts about different actors, and
   * the ledger's entire purpose is recording who decided what. Collapsing them
   * would attribute an administrative action to the requester.
   */
  | "cancelled";

/** One page of the approval ledger. `total` is the unpaged count. */
export interface AssistApprovalListPage {
  requests: AssistApprovalRow[];
  total: number;
}

/**
 * The runtime's answer to `POST /ai/requests/{id}/approve` or `.../reject`.
 *
 * ── THE ONE THING TO GET RIGHT ─────────────────────────────────────────────
 * `status: "failed"` comes back on **HTTP 200**, and that is not a bug to route
 * around. The approval itself succeeded — the human decision was recorded and
 * the runtime attempted the write — and then the TARGET APP rejected it. Two
 * different things failed in two different systems, and only one of them is a
 * transport problem. Rendering this as a network error would tell the user to
 * retry a decision that has already been consumed (approval is deliberately not
 * idempotent, so the retry lands on 409) and would hide the target app's actual
 * complaint, which is the only part that says what to fix.
 *
 * So: 200 + `failed` is an OUTCOME, rendered as an outcome. Only a non-2xx is a
 * failure to decide.
 *
 * Field names are frozen camelCase, per the runtime contract.
 */
export interface AssistApprovalDecision {
  requestId: string;
  /**
   * Terminal state after the decision. `executed` / `failed` follow an approve;
   * `rejected` follows a reject. Typed as the full union rather than a narrowed
   * literal for the same leniency reason as `AssistApprovalStatus` — the runtime
   * may answer with a state this build does not know, and a card that renders it
   * as "unrecognised, not actionable" beats one that throws.
   */
  status: AssistApprovalStatus;
  /** Present on `executed`. The target app's own shape — pass through untouched. */
  result?: Record<string, unknown> | null;
  /** Present on `failed`. The target app's own code, e.g. "APP_API_ERROR". */
  errorCode?: string;
  /** Present on `failed`. The target app's own message. Never rewritten by us. */
  error?: string;
  /**
   * The same generated sentence the ledger row carries — served here too, so the
   * card that just took the decision can show the outcome WITHOUT a refetch.
   *
   * Optional for the same reason as on the row, plus one of its own: this is the
   * runtime's newest field on its newest endpoint, and a card that renders blank
   * when it is absent fails on exactly the deploy skew it exists to survive.
   *
   * ⚠️ On a `failed` decision this does NOT replace `error`. The sentence is
   * deterministic and may say "Could not create the issue" without saying why;
   * `error` is the target app's own words and the only actionable text on the
   * card. Both render.
   */
  outcomeSummary?: string | null;
}

/**
 * `data` on an `ApprovalRequest` message — our own shape, not the runtime's.
 *
 * ── WHY THIS IS A SNAPSHOT AND NOT JUST A POINTER ──────────────────────────
 * The obvious design is `{ requestId }` hydrated server-side on read, the way a
 * `Meeting` message carries `meetingId`. It does not work here, for two reasons
 * that are both properties of the runtime's ledger rather than choices:
 *
 *  1. `GET /ai/requests` is scoped to the CALLER by the minted token, and there
 *     is no fetch-one endpoint. An observer's ledger does not contain the
 *     requester's row, so hydrating for the channel is not slow — it is
 *     impossible. The channel-visible card is the whole point of persisting.
 *  2. The ledger keeps terminal rows for 24h. The message is permanent. A card
 *     that goes blank a day later is worse than the ephemeral one it replaced.
 *
 * So the message carries the facts. The cost is that two places hold one fact
 * and can diverge — see `status` below, and `unconfirmedAt` for what happens
 * when they do.
 */
export interface ApprovalMessageData {
  /** Runtime-owned request id. Also the `clientMessageId` suffix — see the writer. */
  requestId: string;
  /** Who asked. Drives `viewerMayAct`: everyone else gets a read-only card. */
  requesterId: string;
  appId: string;
  toolName: string;
  /** Runtime's sentence for the PROPOSED write. Rendered verbatim. */
  summary: string | null;
  /**
   * Raw wire value, NOT normalised here. `normaliseRisk` in the adapter owns
   * that, so an unknown class renders at the highest risk on this path exactly
   * as it does on the other two.
   */
  riskClass: string;
  /**
   * The tool's arguments, verbatim.
   *
   * Persisted in full even though the OBSERVER card does not render them: the
   * requester's own card still shows the Details expander, and that is the
   * surface where rule 2 (`toolInput` renders verbatim) has to hold. Which
   * viewer sees it is decided at render time by `fromApprovalMessage`, not by
   * what we chose to persist.
   */
  toolInput: Record<string, unknown>;
  expiresAt: string | null;
  /** When WE wrote the proposal. Our clock, not a runtime field. */
  proposedAt: string;
  /**
   * OUR copy of the lifecycle state. Authoritative for DISPLAY only.
   *
   * The runtime remains authoritative for decisions — every Approve/Reject goes
   * to it and it answers 409 if this row is stale, so divergence can produce a
   * wrong screen and never a wrong write.
   */
  status: AssistApprovalStatus;
  outcomeSummary?: string | null;
  error?: string | null;
  /** Who decided, when known. A raw id — resolved to a name only for display. */
  decisionBy?: string | null;
  decisionAt?: string | null;
  /**
   * Set when reconciliation looked for this request and the ledger no longer
   * had it — it aged out of the 24h window while our copy still said `pending`.
   *
   * This is the honest end state of the divergence bound: we cannot learn what
   * happened and will never be able to. The card says so rather than continuing
   * to offer buttons for a decision that may not exist. Reachable in the stub
   * via STUB_AGED_REQUEST_ID — a state only visible in a unit test is one
   * nobody notices rendering wrong.
   */
  unconfirmedAt?: string | null;
  /**
   * When our copy was last known to match the runtime — stamped by the decision
   * patch and by a reconcile that had to correct something.
   *
   * NOT written when a reconcile merely agrees: nothing renders it on a pending
   * card, and a write per card per channel open with no reader is load nobody
   * would attribute to opening a conversation. Kept because it is the audit
   * trail for when a card last moved, and it costs nothing on writes that were
   * happening anyway.
   */
  confirmedAt?: string | null;
}
export interface SendMessageInput {
  content: string;
  /**
   * ⚠️ NOT the same union as `MessageType`, and the gap is the point. `Delete`
   * is a tombstone the delete path writes, and `ApprovalRequest` is written only
   * by the assist relay. Neither may arrive from a client. Enforced at runtime
   * by `messages.send` — this type alone would not stop a hand-rolled POST.
   */
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
 * The realtime `notification` event payload: a serialized row plus transient
 * `desktop` / `sound` flags telling the client whether to ALSO fire an OS-level
 * popup and/or play a sound (the row itself always updates the in-app
 * bell/badge regardless). Both are server-decided (mute / snooze / DND / the
 * user's own toggles) and independent of each other. Neither belongs on the
 * persisted row — strip them before storing the DTO.
 */
export interface NotificationRealtimePayload extends NotificationDto {
  desktop: boolean;
  sound: boolean;
}

export interface NotificationSettingsDto {
  defaultChannelLevel: NotificationLevel;
  dmsLevel: NotificationLevel;
  /** Message-notification chime. */
  soundEnabled: boolean;
  /** Ringtone / ringback / call tones — independent of `soundEnabled`. */
  callSoundsEnabled: boolean;
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
  /** Optional attendees are invited but not required (Graph `type: "optional"`). */
  optional: boolean;
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
  location: string | null;
  /** Calendar-date event: `start`/`end` denote whole days, not instants. */
  allDay: boolean;
  start: string;
  /**
   * ⚠️ INCLUSIVE — the last moment (timed) or last DAY (all-day) the meeting
   * covers. This DIVERGES from storage and from both calendar providers, which
   * use an EXCLUSIVE all-day end: a one-day event on the 14th is stored and
   * sent as 14th 00:00Z → 15th 00:00Z, but arrives here as 14th → 14th.
   *
   * Deliberate. The DTO is our contract, not Graph's, and the alternative makes
   * every renderer responsible for knowing the convention — with a silent
   * failure mode (a one-day event drawn across two days). The single conversion
   * lives in `lib/all-day.ts`; never apply the ±1 day by hand.
   */
  end: string;
  joinUrl: string | null;
  status: MeetingStatus;
  attendees: MeetingAttendeeDto[];
}

/** POST /api/channels/[id]/meetings body. */
export interface CreateMeetingInput {
  title: string;
  description?: string;
  /** Free text — a room, an address, anything. Graph: `location.displayName`. */
  location?: string;
  /**
   * When true, `start`/`end` are CALENDAR DATES (`YYYY-MM-DD`), not instants,
   * and `end` is INCLUSIVE — the last day covered. The server converts to the
   * stored/provider form via `lib/all-day.ts`.
   */
  allDay?: boolean;
  start: string;
  end: string;
  attendeeUserIds: string[];
  /** Subset of `attendeeUserIds` invited as optional rather than required. */
  optionalAttendeeUserIds?: string[];
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

// ============================================================================
// Call history
// ============================================================================

/**
 * Direction as the VIEWER experienced the call. Note there is no voicemail
 * feature — these three are the whole vocabulary.
 *   - "missed"   — an unanswered call TO the viewer (missed / timed_out).
 *   - "outgoing" — the viewer initiated it, whatever the outcome (a call of
 *                  mine that nobody picked up is still outgoing, not missed).
 *   - "incoming" — someone called the viewer and the viewer handled it,
 *                  including declining it.
 */
export type CallDirection = "incoming" | "outgoing" | "missed";

/**
 * One terminal call in the viewer's history (GET /api/calls/history).
 * Timestamps are ISO and durations are raw seconds — all presentation
 * (day/time/date labels, "m:ss") happens client-side via lib/format.ts, as
 * everywhere else in the app.
 */
export interface CallHistoryItem {
  id: string;
  /** Other participant's display name (1:1) or the channel name (group). */
  name: string;
  /** Other participant's avatar; always null for group calls. */
  avatarUrl: string | null;
  direction: CallDirection;
  type: "audio" | "video";
  /** True when the call had more than two participants. */
  isGroup: boolean;
  /** ISO instant the call started (ring start, not answer). */
  startedAt: string;
  /** Talk time in seconds; null when the call was never answered. */
  durationSeconds: number | null;
  /** Terminal status, so the UI can distinguish declined from ended. */
  status: "ended" | "missed" | "rejected" | "timed_out";
  /**
   * Channel the call belonged to, when it had one. Null for a direct call placed
   * outside a channel (QcCall.channelId is nullable), so presence must not be
   * assumed. A send target for the history pane's quick-reply.
   */
  channelId?: string | null;
  /**
   * The other participant's user id on a 1:1 call; null for a group call. Lets a
   * quick reply find-or-create the DM even when the call carried no channel.
   * Named to match `otherUserId` in calling.service.ts, which is where the value
   * is resolved — one term for the concept, not two.
   */
  otherUserId?: string | null;
}
