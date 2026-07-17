/**
 * CalendarProvider seam (S15a). The active impl is `StubCalendarProvider`;
 * `GoogleCalendarProvider` is code-complete-but-inactive (wired to the platform
 * token service in 15b). Domain-wide-delegation model: the provider can resolve
 * any user in the org by email — no per-user "connect calendar" step. Mirrors
 * the storage (S11) / runtime (S12) seam pattern.
 */

export interface FreeBusyBlock {
  start: string; // ISO
  end: string; // ISO
}

/**
 * Per-email free/busy result (S15b). An array of busy blocks when the active
 * provider can see that calendar; the literal `"unknown"` when it cannot (e.g.
 * a Google account outside the single-account's visibility, or a Microsoft user
 * who hasn't connected). `"unknown"` is rendered distinctly — never as "free".
 */
export type FreeBusyForEmail = FreeBusyBlock[] | "unknown";

export interface CreateMeetingInput {
  orgId: string;
  organizerId: string;
  title: string;
  description?: string;
  start: string; // ISO
  end: string; // ISO
  attendeeEmails: string[];
  /** When true, request a conferencing (Meet) link. */
  conferencing: boolean;
}

export interface CreateMeetingResult {
  externalEventId: string | null;
  joinUrl: string | null;
  htmlLink: string | null;
}

export type RsvpStatus = "accepted" | "declined" | "tentative";

/** Provider health/scope probe result (S15b). */
export interface CalendarHealth {
  healthy: boolean;
  /** Actionable message when unhealthy (e.g. "regenerate token with calendar scopes"). */
  message?: string;
}

/**
 * The calendar seam. S15b widened it (backward-compatibly) over S15a:
 *   - `getFreeBusy` may return `"unknown"` per email (provider can't see it),
 *   - all per-user methods take an optional `actingUserId` so per-user-token
 *     providers (Microsoft) can pick the caller's stored token; single-account
 *     providers (Google) and the stub ignore it,
 *   - an optional `verify()` scope/health probe.
 * The S15a `StubCalendarProvider` still satisfies this with no change.
 */
export interface CalendarProvider {
  getFreeBusy(input: {
    orgId: string;
    /** The caller, for per-user-token providers (Microsoft). */
    actingUserId?: string;
    userEmails: string[];
    from: string;
    to: string;
  }): Promise<Record<string, FreeBusyForEmail>>;

  createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult>;

  setRsvp(input: {
    orgId: string;
    actingUserId?: string;
    externalEventId: string;
    userEmail: string;
    status: RsvpStatus;
  }): Promise<void>;

  cancel?(input: { orgId: string; actingUserId?: string; externalEventId: string }): Promise<void>;

  /** Optional health/scope probe; absent → assumed healthy (stub). */
  verify?(): Promise<CalendarHealth>;
}

export type CalendarMode = "stub" | "google" | "microsoft";
