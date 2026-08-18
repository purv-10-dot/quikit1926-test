/**
 * The Graph request body `createMeeting` builds — location, all-day and
 * attendee optionality.
 *
 * SEPARATE FILE, and that is the point: `microsoft.test.ts` is DB-backed and
 * sits in `vitest.config.ts`'s exclude list, so anything added there never
 * runs. These assertions guard a provider payload that is easy to get subtly
 * wrong and impossible to notice locally (the active provider is the stub), so
 * they need to actually execute. Prisma is mocked; no database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../../__tests__/helpers/mockDb";
import { MicrosoftCalendarProvider, microsoftConfigFromEnv } from "./microsoft";
import { encryptToken, resolveEncKey } from "./crypto";

const encKey = resolveEncKey("ms-body-test-enc-key")!;
const cfg = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "https://app.test/cb",
  tenant: "common",
  encKey,
};

/** Captured Graph POST bodies, newest last. */
let posted: Record<string, unknown>[] = [];

beforeEach(() => {
  resetMockDb();
  posted = [];
  // A connected organizer: the provider decrypts this and exchanges it.
  mockDb.qcCalendarConnection.findUnique.mockResolvedValue({
    userId: "u-org",
    provider: "microsoft",
    // Encrypted with the real helper so decryptToken round-trips honestly.
    refreshToken: encryptToken("rt", encKey),
  } as never);
  mockDb.qcCalendarConnection.update.mockResolvedValue({} as never);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oauth2/") || u.includes("/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        } as Response;
      }
      if (init?.method === "POST") posted.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => ({ id: "evt-1" }) } as Response;
    }),
  );
});

async function graphBody(over: Record<string, unknown> = {}) {
  await new MicrosoftCalendarProvider(cfg).createMeeting({
    orgId: "o1",
    organizerId: "u-org",
    title: "Sync",
    start: "2026-08-14T10:00:00.000Z",
    end: "2026-08-14T10:30:00.000Z",
    attendees: [{ email: "a@x.com" }],
    conferencing: false,
    ...over,
  });
  return posted[posted.length - 1]!;
}

describe("Graph createMeeting body", () => {
  it("sends location as location.displayName", async () => {
    expect(await graphBody({ location: "Room 4" })).toMatchObject({
      location: { displayName: "Room 4" },
    });
  });

  it("omits location entirely when absent", async () => {
    expect(await graphBody()).not.toHaveProperty("location");
  });

  it("marks optional attendees and leaves the rest required", async () => {
    const body = await graphBody({
      attendees: [{ email: "req@x.com" }, { email: "opt@x.com", optional: true }],
    });
    expect(body.attendees).toEqual([
      { emailAddress: { address: "req@x.com" }, type: "required" },
      { emailAddress: { address: "opt@x.com" }, type: "optional" },
    ]);
  });

  /**
   * Graph REJECTS `isAllDay` unless start and end are exactly T00:00:00 in the
   * supplied timeZone. The service guarantees midnight-UTC instants; this
   * asserts we actually put them on the wire, with the EXCLUSIVE end Graph
   * expects (one day on the 14th = 14th → 15th).
   */
  it("sets isAllDay with midnight-aligned, exclusive-end times", async () => {
    const body = await graphBody({
      allDay: true,
      start: "2026-08-14T00:00:00.000Z",
      end: "2026-08-15T00:00:00.000Z",
    });
    expect(body.isAllDay).toBe(true);
    expect(body.start).toEqual({ dateTime: "2026-08-14T00:00:00.000Z", timeZone: "UTC" });
    expect(body.end).toEqual({ dateTime: "2026-08-15T00:00:00.000Z", timeZone: "UTC" });
  });

  it("does not set isAllDay for a timed meeting", async () => {
    expect(await graphBody()).not.toHaveProperty("isAllDay");
  });

  it("still requests an online meeting when conferencing is on", async () => {
    expect(await graphBody({ conferencing: true })).toMatchObject({ isOnlineMeeting: true });
  });
});

describe("microsoftConfigFromEnv", () => {
  it("is exported and callable (guards the import surface this file relies on)", () => {
    expect(typeof microsoftConfigFromEnv).toBe("function");
  });
});
