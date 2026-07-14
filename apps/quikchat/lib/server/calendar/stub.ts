/**
 * Deterministic, fully-hermetic calendar stub (active default until 15b wires
 * real Google via domain-wide delegation). Free/busy is derived from a hash of
 * (email + day) so the grid looks realistic and tests are stable; createMeeting
 * returns a synthetic event + a fake Meet link.
 */
import { randomUUID } from "node:crypto";
import type {
  CalendarProvider,
  CreateMeetingInput,
  CreateMeetingResult,
  FreeBusyBlock,
  RsvpStatus,
} from "./types";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** One busy block at `hour:00` UTC on `day` lasting one hour. */
function block(day: string, hour: number): FreeBusyBlock {
  const start = new Date(`${day}T${pad(hour)}:00:00.000Z`);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export class StubCalendarProvider implements CalendarProvider {
  async getFreeBusy(input: {
    orgId: string;
    userEmails: string[];
    from: string;
    to: string;
  }): Promise<Record<string, FreeBusyBlock[]>> {
    const day = input.from.slice(0, 10); // YYYY-MM-DD
    const out: Record<string, FreeBusyBlock[]> = {};
    for (const email of input.userEmails) {
      const h = hash(`${email}|${day}`);
      // Two deterministic busy blocks in the working day.
      out[email] = [block(day, 9 + (h % 3)), block(day, 13 + (h % 4))];
    }
    return out;
  }

  async createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
    const id = randomUUID();
    return {
      externalEventId: `stub-evt-${id}`,
      joinUrl: input.conferencing ? `https://meet.stub/${id}` : null,
      htmlLink: `https://calendar.stub/${id}`,
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
