import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetMockDb, mockDb } from "../helpers/mockDb";

/**
 * createCalendarEventForOrg — Fathom notetaker auto-invite. When
 * FATHOM_NOTETAKER_EMAIL is set, every online meeting gets that address
 * appended as an attendee so Fathom's bot auto-joins and records. Unset (or
 * non-online events) must stay a no-op.
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

describe("createCalendarEventForOrg — Fathom notetaker invite", () => {
  it("appends the notetaker bot when set and the event is an online meeting", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "notetaker@fathom.video";
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "notetaker@fathom.video"]);
  });

  it("does not duplicate the bot if it's already an explicit attendee", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "notetaker@fathom.video";
    await createCalendarEventForOrg("org_A", {
      ...baseEvent,
      attendees: ["a@acme.com", "notetaker@fathom.video"],
      onlineMeeting: true,
    });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "notetaker@fathom.video"]);
  });

  it("does not invite the bot for non-online events", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "notetaker@fathom.video";
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
    process.env.FATHOM_NOTETAKER_EMAIL = "org-wide@fathom.video";
    mockDb.wfConnection.findFirst.mockResolvedValue({
      ...CONN,
      settings: { notetakerEmail: "per-connection@fathom.video" },
    } as never);
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "per-connection@fathom.video"]);
  });

  it("falls back to the env var when the connection has no notetakerEmail setting", async () => {
    process.env.FATHOM_NOTETAKER_EMAIL = "org-wide@fathom.video";
    mockDb.wfConnection.findFirst.mockResolvedValue({ ...CONN, settings: {} } as never);
    await createCalendarEventForOrg("org_A", { ...baseEvent, onlineMeeting: true });
    const [, payload] = createEvent.mock.calls[0];
    expect(payload.attendees).toEqual(["a@acme.com", "org-wide@fathom.video"]);
  });
});
