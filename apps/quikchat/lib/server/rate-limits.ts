import type { RateLimitConfig } from "@/lib/auth-shims";

/**
 * Per-actor rate-limit budgets for mutating REST endpoints. Fixed windows; tune
 * here. Applied via `withOrgAuth(handler, { rateLimit: RATE.xxx })`.
 */
export const RATE = {
  send: { bucket: "send", limit: 30, windowMs: 10_000 },
  reaction: { bucket: "reaction", limit: 60, windowMs: 10_000 },
  inviteCreate: { bucket: "invite_create", limit: 10, windowMs: 60_000 },
  memberAdd: { bucket: "member_add", limit: 30, windowMs: 60_000 },
  channelCreate: { bucket: "channel_create", limit: 20, windowMs: 60_000 },
  // Notifications (S10a): read/clear marks fire often (per channel open) so are
  // generous; settings/preference/keyword writes are rarer.
  notifyRead: { bucket: "notify_read", limit: 120, windowMs: 10_000 },
  notifyWrite: { bucket: "notify_write", limit: 60, windowMs: 60_000 },
  // Media (S11): minting an upload target is cheap but should not be floodable.
  uploadSign: { bucket: "upload_sign", limit: 30, windowMs: 60_000 },
  // AI assistant (S12): conservative — "be polite" to the runtime.
  assist: { bucket: "assist", limit: 10, windowMs: 60_000 },
  /**
   * Listing approvals — a READ, sized like the other reads, NOT like `assist`.
   *
   * Worth stating because the endpoint's capability check is
   * `userCan("Assistant", "create")` while its path has no "assist" in it, so
   * `RATE.assist` looks like the obvious neighbour. It is not: 10/60s is sized
   * for LLM turns, and this is a list a surface may poll or refetch on focus.
   * Shaped after `notifyRead` instead.
   */
  approvalsList: { bucket: "approvals_list", limit: 120, windowMs: 10_000 },
  // KB ingest (Stage 3): explicit "Add to KB" button — deliberate + rare + heavy
  // (indexing on the runtime), so tight.
  ingest: { bucket: "ingest", limit: 10, windowMs: 60_000 },
  // Delivery receipts (S14a): client advances on every inbound message (debounced),
  // so this fires often — keep it generous.
  delivered: { bucket: "delivered", limit: 120, windowMs: 10_000 },
  // Calendar (S15a): free/busy refetches as the scheduler picks days (generous);
  // creating a meeting + RSVP are deliberate user actions (tighter).
  freeBusy: { bucket: "free_busy", limit: 60, windowMs: 10_000 },
  meetingCreate: { bucket: "meeting_create", limit: 20, windowMs: 60_000 },
  rsvp: { bucket: "rsvp", limit: 30, windowMs: 60_000 },
  // Personal calendar (S17): list/read on view+nav (generous); event writes tighter.
  calendarRead: { bucket: "calendar_read", limit: 120, windowMs: 10_000 },
  calendarWrite: { bucket: "calendar_write", limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitConfig>;
