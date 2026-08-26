import { describe, it, expect } from "vitest";
import { TEAMS } from "@/lib/connectors/teams";

/**
 * The Fathom bot must WAIT IN THE LOBBY until a human admits it.
 *
 * That behaviour exists today by omission: `toGraphEvent` writes no lobby
 * settings, so the meeting inherits the organiser's Teams policy and an
 * anonymous notetaker is held. Omission is fragile — a well-meaning "make the
 * bot join automatically" change would silently flip the product requirement
 * and, worse, drag OnlineMeetings.ReadWrite (and re-consent for every existing
 * connection) in with it. These assert on the actual Graph request body, which
 * is the only level at which "we did not send that" is a fact rather than a
 * claim about the current source.
 *
 * Same stubbed-fetch helper as teams-optional-attendees.test.ts, for the same
 * reason: `toGraphEvent` is private, and what reaches Microsoft is what counts.
 */
async function graphBodyFor(event: Record<string, unknown>): Promise<Record<string, unknown>> {
  const original = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: { body?: string }) => {
    captured = JSON.parse(init.body ?? "{}");
    return { ok: true, status: 201, json: async () => ({ id: "evt_1" }) } as unknown as Response;
  }) as typeof fetch;
  try {
    await TEAMS.createEvent("token", event as never);
  } finally {
    globalThis.fetch = original;
  }
  return captured;
}

const BASE = {
  subject: "Daily Huddle — Quikit",
  start: "2026-08-26T09:30:00",
  end: "2026-08-26T09:50:00",
  timeZone: "UTC",
  onlineMeeting: true,
  attendees: ["rahul@x.com", "notetaker@fathom.video"],
};

/**
 * Every knob that would admit, auto-record, or otherwise change how a
 * participant enters the meeting. None of these may appear in the payload.
 */
const FORBIDDEN_KEYS = [
  "lobbyBypassSettings",
  "allowedPresenters",
  "autoAdmittedUsers",
  "isEntryExitAnnounced",
  "recordAutomatically",
  "allowAttendeeToEnableMic",
  "allowAttendeeToEnableCamera",
];

describe("Teams event creation — lobby behaviour is left to tenant policy", () => {
  it("attaches a Teams meeting without writing any lobby/admission setting", async () => {
    const body = await graphBodyFor(BASE);

    expect(body.isOnlineMeeting).toBe(true);
    expect(body.onlineMeetingProvider).toBe("teamsForBusiness");
    for (const key of FORBIDDEN_KEYS) {
      expect(body, `${key} must not be sent — the bot must wait for a human to admit it`).not.toHaveProperty(key);
    }
  });

  it("invites the notetaker as a REQUIRED attendee", async () => {
    const body = await graphBodyFor(BASE);

    expect(body.attendees).toContainEqual({
      emailAddress: { address: "notetaker@fathom.video" },
      type: "required",
    });
  });

  it("sends no lobby settings on update either", async () => {
    // The idempotent re-run path shares the same payload builder; a bypass
    // sneaking in on PATCH would be just as much of a regression.
    const original = globalThis.fetch;
    let captured: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init: { body?: string }) => {
      captured = JSON.parse(init.body ?? "{}");
      return { ok: true, status: 200, json: async () => ({ id: "evt_1" }) } as unknown as Response;
    }) as typeof fetch;
    try {
      await TEAMS.updateEvent("token", "evt_1", BASE as never);
    } finally {
      globalThis.fetch = original;
    }

    for (const key of FORBIDDEN_KEYS) {
      expect(captured).not.toHaveProperty(key);
    }
  });

  it("requests no WRITE scope on the onlineMeeting resource", () => {
    // OnlineMeetings.Read.All is already consented for the attendance report
    // (CAPTURE_SCOPES) and is read-only. The write scope is what writing lobby
    // settings would need, and adding it would force re-consent on every
    // existing connection — see the msRefresh note in teams.ts.
    expect(TEAMS.scopes.some((s) => /onlinemeeting.*readwrite/i.test(s))).toBe(false);
    expect(TEAMS.scopes).toContain("Calendars.ReadWrite");
  });

  it("pins the exact consented scope set", () => {
    // A snapshot so any scope change is a deliberate, reviewed edit rather
    // than a side effect of a feature that "just needed one more permission".
    expect(TEAMS.scopes).toEqual([
      "offline_access",
      "Calendars.ReadWrite",
      "User.Read",
      "OnlineMeetings.Read.All",
      "OnlineMeetingArtifact.Read.All",
    ]);
  });
});
