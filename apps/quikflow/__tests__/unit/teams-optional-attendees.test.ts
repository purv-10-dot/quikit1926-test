import { describe, it, expect } from "vitest";
import { TEAMS } from "@/lib/connectors/teams";

/**
 * Optional attendees on the Graph event.
 *
 * Until now `toGraphEvent` stamped every attendee `type: "required"`, so the
 * calendar contradicted `ClientTeamMember.attendanceType` and the attendance
 * report had no way to tell a no-show that counts from one that does not
 * (doc 15 §4.5 tiers 1c/1d). These tests pin the mapping.
 *
 * `toGraphEvent` is private, so the body is observed through a stubbed fetch —
 * which is also the honest level to assert at: what actually reaches Microsoft.
 */
async function graphBodyFor(event: Record<string, unknown>): Promise<Record<string, unknown>> {
  const original = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: { body?: string }) => {
    captured = JSON.parse(init.body ?? "{}");
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: "evt_1" }),
    } as unknown as Response;
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
};

describe("toGraphEvent attendee types", () => {
  it("marks optional attendees optional and everyone else required", async () => {
    const body = await graphBodyFor({
      ...BASE,
      attendees: ["rahul@x.com"],
      optionalAttendees: ["priya@x.com"],
    });

    expect(body.attendees).toEqual([
      { emailAddress: { address: "rahul@x.com" }, type: "required" },
      { emailAddress: { address: "priya@x.com" }, type: "optional" },
    ]);
  });

  it("keeps every attendee required when no optional list is given", async () => {
    const body = await graphBodyFor({ ...BASE, attendees: ["rahul@x.com", "ajay@x.com"] });

    expect(body.attendees).toEqual([
      { emailAddress: { address: "rahul@x.com" }, type: "required" },
      { emailAddress: { address: "ajay@x.com" }, type: "required" },
    ]);
  });

  it("emits the array when ONLY optional attendees are supplied", async () => {
    // Graph replaces the whole attendees array on update, so skipping it here
    // would silently drop every optional invitee from an existing event.
    const body = await graphBodyFor({ ...BASE, optionalAttendees: ["priya@x.com"] });

    expect(body.attendees).toEqual([
      { emailAddress: { address: "priya@x.com" }, type: "optional" },
    ]);
  });

  it("lets required win a duplicate rather than inviting the same address twice", async () => {
    // Graph rejects a repeated address, and the stricter obligation is the safe
    // one to keep.
    const body = await graphBodyFor({
      ...BASE,
      attendees: ["Rahul@x.com"],
      optionalAttendees: [" rahul@x.com "],
    });

    expect(body.attendees).toEqual([
      { emailAddress: { address: "Rahul@x.com" }, type: "required" },
    ]);
  });

  it("omits attendees entirely when neither list is supplied", async () => {
    // An update that does not mention attendees must not clear them.
    const body = await graphBodyFor(BASE);
    expect(body.attendees).toBeUndefined();
  });
});
