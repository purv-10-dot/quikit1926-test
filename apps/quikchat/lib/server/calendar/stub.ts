/**
 * Hermetic calendar stub (active default until 15b wires real Google via
 * domain-wide delegation). No real provider is configured, so this returns
 * honest "I can't see this" data rather than fabricating a plausible-looking
 * calendar: `getFreeBusy` reports every email as `"unknown"` — the same value a
 * real provider uses for a calendar it can't see — which the free/busy grid
 * already renders as a distinct hatched "Availability unknown" lane, never as
 * free. `createMeeting` never invents a join link, event id, or html link;
 * `MeetingCard` already omits the "Join meeting" button when `joinUrl` is
 * null, so no client change was needed to make either honest.
 */
import type {
  CalendarProvider,
  CreateMeetingInput,
  CreateMeetingResult,
  FreeBusyForEmail,
  RsvpStatus,
} from "./types";

export class StubCalendarProvider implements CalendarProvider {
  async getFreeBusy(input: {
    orgId: string;
    userEmails: string[];
    from: string;
    to: string;
  }): Promise<Record<string, FreeBusyForEmail>> {
    const out: Record<string, FreeBusyForEmail> = {};
    for (const email of input.userEmails) out[email] = "unknown";
    return out;
  }

  async createMeeting(_input: CreateMeetingInput): Promise<CreateMeetingResult> {
    return {
      externalEventId: null,
      joinUrl: null,
      htmlLink: null,
    };
  }

  async setRsvp(_input: {
    orgId: string;
    externalEventId: string;
    userEmail: string;
    status: RsvpStatus;
  }): Promise<void> {
    // no-op (succeeds)
  }

  async cancel(_input: { orgId: string; externalEventId: string }): Promise<void> {
    // no-op (succeeds)
  }
}
