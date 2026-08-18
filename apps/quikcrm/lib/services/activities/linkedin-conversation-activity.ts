/**
 * Idempotency key for the "LinkedIn Conversation" activity.
 *
 * BUSINESS RULE: same prospect + same calendar day = exactly ONE activity,
 * however many times the conversation is re-saved and however many messages it
 * contains.
 *
 * That is enforced by the DATABASE rather than by a read-then-create check:
 * `CrmActivity` already carries `@@unique([orgId, sourceSystem, externalId])`,
 * and `logActivity()` upserts on it with `update: {}`. Encoding the calendar day
 * into `externalId` therefore makes the rule race-free — two concurrent saves
 * collapse to one row instead of both passing an existence check and inserting.
 */

import { safeTz } from "@/lib/services/dashboard/period";

export const LINKEDIN_CONVERSATION_CODE = "linkedin_conversation";
export const LINKEDIN_CONVERSATION_LABEL = "LinkedIn Conversation";
/** Matches the sourceSystem already used by the extension's ProspectSaved rows. */
export const LINKEDIN_SOURCE_SYSTEM = "linkedin-extension";

/**
 * `YYYY-MM-DD` for `instant` as observed in `tz`.
 *
 * Uses the same Intl.DateTimeFormat convention as the dashboard's period
 * helpers — no new timezone mechanism. `en-CA` yields ISO-ordered parts
 * directly, which avoids hand-assembling the string.
 */
export function calendarDayInTz(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * The per-prospect-per-day external id.
 *
 * Shape: `linkedin-conversation:<prospectId>:<YYYY-MM-DD>`
 *   • different prospects → different ids
 *   • different days      → different ids
 *   • same prospect+day   → SAME id → logActivity's upsert is a no-op
 */
export function linkedInConversationExternalId(
  prospectId: string,
  occurredAt: Date,
  tz: string,
): string {
  return `linkedin-conversation:${prospectId}:${calendarDayInTz(occurredAt, tz)}`;
}
