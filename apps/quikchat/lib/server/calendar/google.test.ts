import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarProvider, googleConfigFromEnv } from "./google";

const cfg = { clientId: "id", clientSecret: "s", refreshToken: "rt", calendarId: "primary" };

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** Route a mocked fetch by (method, url); records calls for assertions. */
function mockFetch(routes: (call: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body ? safeJson(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status = 200, json = {} } = routes(call);
    return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
const isToken = (u: string) => u.includes("oauth2.googleapis.com/token");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("googleConfigFromEnv", () => {
  it("requires id/secret/refresh-token; defaults calendarId to primary", () => {
    expect(googleConfigFromEnv({})).toBeNull();
    expect(
      googleConfigFromEnv({
        GOOGLE_CLIENT_ID: "a",
        GOOGLE_CLIENT_SECRET: "b",
        GMAIL_REFRESH_TOKEN: "c",
      }),
    ).toMatchObject({ calendarId: "primary" });
  });
});

describe("GoogleCalendarProvider token handling", () => {
  it("exchanges the refresh token once and caches the access token", async () => {
    const calls = mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at1", expires_in: 3600 } } : { json: {} },
    );
    const p = new GoogleCalendarProvider(cfg);
    await p.verify();
    await p.verify();
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(1);
  });
});

describe("GoogleCalendarProvider.verify (scope probe)", () => {
  it("returns an actionable message on insufficient scopes (403)", async () => {
    mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at", expires_in: 3600 } } : { status: 403 },
    );
    const health = await new GoogleCalendarProvider(cfg).verify();
    expect(health.healthy).toBe(false);
    expect(health.message).toMatch(/calendar scopes/i);
  });

  it("is healthy when calendarList succeeds", async () => {
    mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at", expires_in: 3600 } } : { json: { items: [] } },
    );
    expect(await new GoogleCalendarProvider(cfg).verify()).toEqual({ healthy: true });
  });
});

describe("GoogleCalendarProvider.getFreeBusy", () => {
  it("maps busy blocks and marks unseen calendars 'unknown'", async () => {
    mockFetch((c) => {
      if (isToken(c.url)) return { json: { access_token: "at", expires_in: 3600 } };
      return {
        json: {
          calendars: {
            "a@x.com": { busy: [{ start: "2026-06-20T10:00:00Z", end: "2026-06-20T11:00:00Z" }] },
            "b@x.com": { errors: [{ reason: "notFound" }] },
          },
        },
      };
    });
    const out = await new GoogleCalendarProvider(cfg).getFreeBusy({
      orgId: "o",
      userEmails: ["a@x.com", "b@x.com"],
      from: "2026-06-20T00:00:00Z",
      to: "2026-06-20T23:59:59Z",
    });
    expect(Array.isArray(out["a@x.com"])).toBe(true);
    expect(out["b@x.com"]).toBe("unknown");
  });
});

describe("GoogleCalendarProvider degradation (S16)", () => {
  it("getFreeBusy degrades to 'unknown' (never throws) when the token refresh fails", async () => {
    mockFetch((c) => (isToken(c.url) ? { status: 400 } : { json: {} }));
    const out = await new GoogleCalendarProvider(cfg).getFreeBusy({
      orgId: "o",
      userEmails: ["a@x.com", "b@x.com"],
      from: "2026-06-20T00:00:00Z",
      to: "2026-06-20T23:59:59Z",
    });
    expect(out["a@x.com"]).toBe("unknown");
    expect(out["b@x.com"]).toBe("unknown");
  });

  it("createMeeting throws on API failure (the service converts it to a 502)", async () => {
    mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at", expires_in: 3600 } } : { status: 400 },
    );
    await expect(
      new GoogleCalendarProvider(cfg).createMeeting({
        orgId: "o",
        organizerId: "u",
        title: "x",
        start: "2026-06-20T10:00:00Z",
        end: "2026-06-20T10:30:00Z",
        attendeeEmails: [],
        conferencing: true,
      }),
    ).rejects.toThrow();
  });
});

describe("GoogleCalendarProvider.createMeeting", () => {
  it("builds events.insert with conferenceData and returns the Meet link", async () => {
    const calls = mockFetch((c) => {
      if (isToken(c.url)) return { json: { access_token: "at", expires_in: 3600 } };
      return {
        json: { id: "ev1", hangoutLink: "https://meet.google/x", htmlLink: "https://cal/x" },
      };
    });
    const r = await new GoogleCalendarProvider(cfg).createMeeting({
      orgId: "o",
      organizerId: "u",
      title: "Sync",
      start: "2026-06-20T10:00:00Z",
      end: "2026-06-20T10:30:00Z",
      attendeeEmails: ["a@x.com"],
      conferencing: true,
    });
    expect(r).toEqual({
      externalEventId: "ev1",
      joinUrl: "https://meet.google/x",
      htmlLink: "https://cal/x",
    });
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect(insert.url).toContain("conferenceDataVersion=1");
    expect((insert.body as { conferenceData?: unknown }).conferenceData).toBeTruthy();
    expect((insert.body as { attendees: unknown[] }).attendees).toHaveLength(1);
  });

  it("omits conferenceData when conferencing is off", async () => {
    const calls = mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at", expires_in: 3600 } } : { json: { id: "ev2" } },
    );
    await new GoogleCalendarProvider(cfg).createMeeting({
      orgId: "o",
      organizerId: "u",
      title: "No call",
      start: "2026-06-20T10:00:00Z",
      end: "2026-06-20T10:30:00Z",
      attendeeEmails: [],
      conferencing: false,
    });
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect((insert.body as { conferenceData?: unknown }).conferenceData).toBeUndefined();
  });
});

describe("GoogleCalendarProvider.setRsvp / cancel", () => {
  it("patches the matching attendee's responseStatus", async () => {
    const calls = mockFetch((c) => {
      if (isToken(c.url)) return { json: { access_token: "at", expires_in: 3600 } };
      if (c.method === "GET") return { json: { attendees: [{ email: "a@x.com" }] } };
      return { json: {} };
    });
    await new GoogleCalendarProvider(cfg).setRsvp({
      orgId: "o",
      externalEventId: "ev1",
      userEmail: "a@x.com",
      status: "accepted",
    });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch).toBeTruthy();
    const attendees = (patch.body as { attendees: { email: string; responseStatus?: string }[] })
      .attendees;
    expect(attendees[0]).toMatchObject({ email: "a@x.com", responseStatus: "accepted" });
  });

  it("DELETEs the event on cancel", async () => {
    const calls = mockFetch((c) =>
      isToken(c.url) ? { json: { access_token: "at", expires_in: 3600 } } : { json: {} },
    );
    await new GoogleCalendarProvider(cfg).cancel({ orgId: "o", externalEventId: "ev1" });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
