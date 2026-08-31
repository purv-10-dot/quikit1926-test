import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetMockDb, mockDb } from "../helpers/mockDb";

/**
 * The end-to-end shape of the AADSTS65001 outage, at the layer the user felt it.
 *
 * A connection consented BEFORE the attendance feature holds only the three
 * original scopes. Creating a Teams meeting on it must still work: the capture
 * scopes are for the attendance report alone, and the report degrading is not a
 * reason for "Create Teams meetings" to fail. It failed anyway, because the
 * refresh grant re-asserted the current scope constant and Entra rejected the
 * whole token exchange — one layer below every calendar call.
 *
 * Also pins the reporting half: a dead grant is recorded on the connection, so
 * the remedy is visible on the Connections page rather than only inside one
 * workflow run's log.
 */
vi.mock("../../lib/connectors/crypto", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

const createEvent = vi.fn();
const refresh = vi.fn();
vi.mock("../../lib/connectors/teams", () => ({
  TEAMS: {
    id: "teams",
    label: "Microsoft Teams",
    scopes: [],
    refresh: (...a: unknown[]) => refresh(...a),
    createEvent: (...a: unknown[]) => createEvent(...a),
  },
  REQUIRED_SCOPES: ["offline_access", "Calendars.ReadWrite", "User.Read"],
  CAPTURE_SCOPES: ["OnlineMeetings.Read.All", "OnlineMeetingArtifact.Read.All"],
}));

import { createCalendarEventForOrg, getFreshAccessToken } from "@/lib/connectors";
import { ReconnectRequiredError } from "@/lib/connectors/types";

/** Scopes granted before the attendance feature ever existed. */
const LEGACY_SCOPES = ["offline_access", "Calendars.ReadWrite", "User.Read"];

/** Expired access token, so every call is forced through the refresh path. */
const STALE_CONN = {
  id: "conn_1",
  orgId: "org_A",
  provider: "teams",
  label: "organiser@org.com",
  accessToken: "expired_tok",
  refreshToken: "stored_refresh",
  expiresAt: new Date(Date.now() - 60_000),
  scopes: LEGACY_SCOPES,
  settings: null,
};

const EVENT = {
  subject: "Daily Huddle — Acme",
  start: "2026-08-26T12:01:00",
  end: "2026-08-26T12:30:00",
  timeZone: "Asia/Kolkata",
  attendees: ["a@acme.com"],
  onlineMeeting: true,
};

beforeEach(() => {
  resetMockDb();
  createEvent.mockReset();
  refresh.mockReset();
  delete process.env.FATHOM_NOTETAKER_EMAIL;
});
afterEach(() => vi.restoreAllMocks());

describe("a connection consented before the capture scopes", () => {
  it("still creates a Teams meeting (the outage, at the layer the user felt it)", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue(STALE_CONN as never);
    mockDb.wfConnection.update.mockResolvedValue(STALE_CONN as never);
    // A real refresh on a legacy grant returns only the legacy scopes.
    refresh.mockResolvedValue({
      accessToken: "fresh_tok",
      refreshToken: "stored_refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: LEGACY_SCOPES,
      email: "",
    });
    createEvent.mockResolvedValue({ id: "evt_1", webLink: "https://web", joinUrl: "https://join" });

    const result = await createCalendarEventForOrg("org_A", EVENT);

    expect(result).toMatchObject({ id: "evt_1", updated: false, organizer: "organiser@org.com" });
    expect(createEvent).toHaveBeenCalledTimes(1);
    // And the subject genuinely reached the provider — the symptom that first
    // read as "the meeting has no title" was this call never happening at all.
    expect(createEvent.mock.calls[0][1]).toMatchObject({ subject: "Daily Huddle — Acme" });
  });

  it("persists the refreshed token without widening the recorded scopes", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue(STALE_CONN as never);
    mockDb.wfConnection.update.mockResolvedValue(STALE_CONN as never);
    refresh.mockResolvedValue({
      accessToken: "fresh_tok",
      refreshToken: "stored_refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: LEGACY_SCOPES,
      email: "",
    });

    const token = await getFreshAccessToken(STALE_CONN as never);

    expect(token).toBe("fresh_tok");
    const written = mockDb.wfConnection.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(written.status).toBe("connected");
    expect(written.accessToken).toBe("fresh_tok");
    // Scopes are set at consent time and never re-stamped by a refresh; a
    // legacy connection must not silently acquire capture permissions.
    expect(written).not.toHaveProperty("scopes");
  });
});

describe("a genuinely dead grant", () => {
  it("marks the connection as errored so the Connections page can say so", async () => {
    mockDb.wfConnection.update.mockResolvedValue(STALE_CONN as never);
    refresh.mockRejectedValue(new ReconnectRequiredError("Microsoft access needs to be reconnected."));

    await expect(getFreshAccessToken(STALE_CONN as never)).rejects.toBeInstanceOf(ReconnectRequiredError);

    expect(mockDb.wfConnection.update).toHaveBeenCalledWith({
      where: { id: "conn_1" },
      data: { status: "error" },
    });
  });

  it("does not mark the connection errored for a transient failure", async () => {
    mockDb.wfConnection.update.mockResolvedValue(STALE_CONN as never);
    refresh.mockRejectedValue(new Error("Microsoft token exchange failed: Service is busy"));

    // A 503 must not latch the connection into a state that tells the org to
    // reconnect an account that is perfectly fine.
    await expect(getFreshAccessToken(STALE_CONN as never)).rejects.toThrow(/Service is busy/);
    expect(mockDb.wfConnection.update).not.toHaveBeenCalled();
  });

  it("still surfaces the reconnect error to the caller after recording it", async () => {
    mockDb.wfConnection.update.mockResolvedValue(STALE_CONN as never);
    refresh.mockRejectedValue(new ReconnectRequiredError("needs reconnect"));

    const err = await getFreshAccessToken(STALE_CONN as never).catch((e) => e);
    expect(err).toBeInstanceOf(ReconnectRequiredError);
  });
});
