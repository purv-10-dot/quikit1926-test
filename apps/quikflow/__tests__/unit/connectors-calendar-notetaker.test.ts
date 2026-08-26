import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetMockDb, mockDb } from "../helpers/mockDb";

/**
 * createCalendarEventForOrg — Fathom auto-invite. Every online meeting gets the
 * configured address appended as a REQUIRED attendee. Unset (or non-online
 * events) must stay a no-op.
 *
 * The address is a Fathom USER's own mailbox, not a bot's: Fathom has no
 * invitable notetaker address, and joins from the calendar connected to a
 * Fathom account. The invite is what puts a QuikFlow-created meeting on that
 * calendar — which is why the fixtures here are person addresses, and why a
 * bot-shaped one is a reported failure rather than an invite.
 */
vi.mock("../../lib/connectors/crypto", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

const createEvent = vi.fn();
vi.mock("../../lib/connectors/teams", () => ({
  TEAMS: { id: "teams", label: "Microsoft Teams", scopes: [], createEvent: (...a: unknown[]) => createEvent(...a) },
}));

import { createCalendarEventForOrg } from "@/lib/connectors";

const CONN = {
  id: "conn_1",
  orgId: "org_A",
  provider: "teams",
  label: "me@org.com",
  accessToken: "tok",
  refreshToken: "refresh",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

beforeEach(() => {
  resetMockDb();
  createEvent.mockReset();
  createEvent.mockResolvedValue({ id: "evt_1", webLink: null, joinUrl: null });
  mockDb.wfConnection.findFirst.mockResolvedValue(CONN as never);
  delete process.env.FATHOM_NOTETAKER_EMAIL;
});

afterEach(() => {
  delete process.env.FATHOM_NOTETAKER_EMAIL;
});

const baseEvent = {
  subject: "Weekly Sync",
  start: "2026-08-10T10:00:00",
  end: "2026-08-10T10:30:00",
  timeZone: "UTC",
  attendees: ["a@acme.com"],
};

describe("createCalendarEventForOrg — Fathom account invite", () => {
  it("appends the Fathom account address when set and the event is an online meeting", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "rohit@quikit.com"]);
  });

  it("does not duplicate the address if it is already an explicit attendee", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    await createCalendarEventForOrg("org_A", {
      ...baseEvent,
      attendees: ["a@acme.com", "rohit@quikit.com"],
      onlineMeeting: true,
    });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "rohit@quikit.com"]);
  });

  it("does not invite anyone extra for non-online events", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: false });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com"]);
  });

  it("is a no-op when FATHOM_NOTETAKER_EMAIL is unset", async () => {
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com"]);
  });

  it("prefers the per-connection notetakerEmail setting over the env var", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "org-wide@quikit.com";
    mockDb.wfConnection.findFirst.mockResolvedValue({
      ...CONN,
      settings: { notetakerEmail: "per-connection@quikit.com" },
    } as never);
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "per-connection@quikit.com"]);
  });

  it("falls back to the env var when the connection has no notetakerEmail setting", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "org-wide@quikit.com";
    mockDb.wfConnection.findFirst.mockResolvedValue({ ...CONN, settings: {} } as never);
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "org-wide@quikit.com"]);
  });

  it("keeps the address REQUIRED even when the caller passed it as optional", async () => {
    // The bot is how the meeting gets recorded at all — it is never a guest
    // whose absence is fine. It lands in `attendees`, and toGraphEvent's
    // required-wins-a-duplicate rule drops the optional copy.
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    await createCalendarEventForOrg("org_A", {
      ...baseEvent,
      optionalAttendees: ["rohit@quikit.com"],
      onlineMeeting: true,
    });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "rohit@quikit.com"]);
  });
});

/**
 * The invite outcome is REPORTED, never silent.
 *
 * An org with no notetaker configured still gets its meeting — but the caller
 * (workflow run output, /api/internal/calendar/schedule, QuikScale's "Create
 * Teams meetings") must be told the meeting will NOT be recorded. A plain
 * success for an unrecorded meeting is the failure mode these pin.
 */
describe("createCalendarEventForOrg — notetaker outcome reporting", () => {
  it("reports the invited address when one is configured", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    expect(result).toMatchObject({ notetaker: "rohit@quikit.com", notetakerInvited: true });
    expect(result?.notetakerNote).toBeUndefined();
  });

  it("still creates the meeting but reports not-configured when no email is set", async () => {
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    expect(createEvent).toHaveBeenCalledTimes(1); // the meeting is real
    expect(result).toMatchObject({
      notetaker: null,
      notetakerInvited: false,
      notetakerNote: "not-configured",
    });
  });

  it("treats a malformed configured address as not-invited and never sends it to Graph", async () => {
    // One typo must not 400 the whole event — that would cost the meeting as
    // well as the recording.
    process.env.FATHOM_NOTETAKER_EMAIL = "notetaker-at-fathom";
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com"]);
    expect(result).toMatchObject({
      notetaker: null,
      notetakerInvited: false,
      notetakerNote: "invalid-email",
    });
  });

  it("refuses a bot-looking address and says so", async () => {
    // Fathom has no invitable mailbox: notetaker@fathom.video is nobody's
    // inbox, so the invite bounces and Fathom never learns the meeting exists
    // — the exact silent failure this reason was added to expose.
    process.env.FATHOM_NOTETAKER_EMAIL = "notetaker@fathom.video";
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com"]);
    expect(result).toMatchObject({
      notetaker: null,
      notetakerInvited: false,
      notetakerNote: "bot-mailbox",
    });
  });

  it.each(["bot@fathom.ai", "Fathom-Bot@acme.com", "meeting-notetaker@acme.com"])(
    "treats %s as a bot mailbox regardless of domain",
    async (address) => {
      mockDb.wfConnection.findFirst.mockResolvedValue({
        ...CONN,
        settings: { notetakerEmail: address },
      } as never);
      const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
      expect(result?.notetakerNote).toBe("bot-mailbox");
    },
  );

  it("still invites a real person on a Fathom-adjacent domain-free name", async () => {
    // Guard against the detection being too eager: a normal human address must
    // keep working, which is the whole point of the setting.
    mockDb.wfConnection.findFirst.mockResolvedValue({
      ...CONN,
      settings: { notetakerEmail: "rohit@quikit.com" },
    } as never);
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "rohit@quikit.com"]);
    expect(result).toMatchObject({ notetaker: "rohit@quikit.com", notetakerInvited: true });
  });

  it("reports not-an-online-meeting for a room-only event", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    const result = await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: false });
    expect(result).toMatchObject({
      notetaker: null,
      notetakerInvited: false,
      notetakerNote: "not-an-online-meeting",
    });
  });

  it("counts an already-listed address as invited rather than reporting a miss", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "rohit@quikit.com";
    const result = await createCalendarEventForOrg("org_A", {
      ...baseEvent,
      attendees: ["a@acme.com", "Rohit@QuikIT.com"],
      onlineMeeting: true,
    });
    expect(result).toMatchObject({ notetaker: "rohit@quikit.com", notetakerInvited: true });
  });
});
