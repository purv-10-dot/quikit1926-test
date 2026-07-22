import { db as prisma } from "@quikit/database";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptToken, resolveEncKey } from "./crypto";
import {
  buildAuthUrl,
  disconnect,
  getConnection,
  handleCallback,
  MicrosoftCalendarProvider,
  microsoftConfigFromEnv,
  signState,
  verifyState,
} from "./microsoft";

const cfg = {
  clientId: "mcid",
  clientSecret: "msecret",
  redirectUri: "https://app.test/cb",
  tenant: "common",
  encKey: resolveEncKey("ms-test-enc-key")!,
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}
function mockFetch(routes: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body ? String(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, json = {} } = routes(call);
    return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
const isToken = (u: string) => u.includes("/oauth2/v2.0/token");

let orgAId = "";
let aliceId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await prisma.qcCalendarConnection.deleteMany({ where: { userId: aliceId } });
  await prisma.$disconnect();
});

describe("microsoftConfigFromEnv", () => {
  it("needs client/secret/redirect + enc key", () => {
    expect(microsoftConfigFromEnv({})).toBeNull();
    expect(
      microsoftConfigFromEnv({
        MICROSOFT_CLIENT_ID: "a",
        MICROSOFT_CLIENT_SECRET: "b",
        MICROSOFT_REDIRECT_URI: "https://app/cb",
        CALENDAR_TOKEN_ENC_KEY: "k",
      }),
    ).toMatchObject({ tenant: "common" });
  });
});

describe("OAuth state (CSRF binding)", () => {
  it("round-trips the userId and rejects tampering / wrong key", () => {
    const state = signState(cfg, aliceId || "u1");
    expect(verifyState(cfg, state)).toBe(aliceId || "u1");
    expect(verifyState(cfg, state + "x")).toBeNull();
    expect(verifyState(cfg, "garbage")).toBeNull();
  });
  it("buildAuthUrl includes scopes + redirect + state", () => {
    const url = buildAuthUrl(cfg, "st8");
    expect(url).toContain("Calendars.ReadWrite");
    expect(url).toContain(encodeURIComponent(cfg.redirectUri));
    expect(url).toContain("state=st8");
  });
});

describe("handleCallback", () => {
  it("stores the refresh token ENCRYPTED (never plaintext) + the mailbox", async () => {
    mockFetch((c) => {
      if (isToken(c.url))
        return {
          json: { access_token: "at", refresh_token: "ms-rt-1", scope: "Calendars.ReadWrite" },
        };
      return { json: { mail: "alice@acme.test" } }; // GET /me
    });
    const { email } = await handleCallback(cfg, orgAId, aliceId, "code-123");
    expect(email).toBe("alice@acme.test");

    const row = await prisma.qcCalendarConnection.findUniqueOrThrow({
      where: { userId_provider: { userId: aliceId, provider: "microsoft" } },
    });
    expect(row.refreshToken).not.toContain("ms-rt-1"); // encrypted at rest
    expect(decryptToken(row.refreshToken, cfg.encKey)).toBe("ms-rt-1");
    expect(await getConnection(aliceId)).toEqual({ email: "alice@acme.test" });
  });
});

describe("MicrosoftCalendarProvider.getFreeBusy", () => {
  it("uses the connected user's token and maps the schedule", async () => {
    mockFetch((c) => {
      if (isToken(c.url)) return { json: { access_token: "at2", refresh_token: "ms-rt-1" } };
      return {
        json: {
          value: [
            {
              scheduleId: "bob@x.com",
              scheduleItems: [
                {
                  status: "busy",
                  start: { dateTime: "2026-06-20T10:00:00" },
                  end: { dateTime: "2026-06-20T11:00:00" },
                },
              ],
            },
            { scheduleId: "ghost@x.com", error: { message: "no" } },
          ],
        },
      };
    });
    const out = await new MicrosoftCalendarProvider(cfg).getFreeBusy({
      orgId: orgAId,
      actingUserId: aliceId,
      userEmails: ["bob@x.com", "ghost@x.com"],
      from: "2026-06-20T00:00:00Z",
      to: "2026-06-20T23:59:59Z",
    });
    expect(Array.isArray(out["bob@x.com"])).toBe(true);
    expect((out["bob@x.com"] as unknown[]).length).toBe(1);
    expect(out["ghost@x.com"]).toBe("unknown");
  });

  it("reports 'unknown' for everyone when the acting user is not connected", async () => {
    mockFetch(() => ({ json: {} }));
    const out = await new MicrosoftCalendarProvider(cfg).getFreeBusy({
      orgId: orgAId,
      actingUserId: "not-connected-user",
      userEmails: ["x@y.com"],
      from: "2026-06-20T00:00:00Z",
      to: "2026-06-20T23:59:59Z",
    });
    expect(out["x@y.com"]).toBe("unknown");
  });
});

describe("MicrosoftCalendarProvider.createMeeting", () => {
  it("creates an online event for the connected organizer", async () => {
    const calls = mockFetch((c) => {
      if (isToken(c.url)) return { json: { access_token: "at2", refresh_token: "ms-rt-1" } };
      return {
        json: {
          id: "ev-ms",
          onlineMeeting: { joinUrl: "https://teams/x" },
          webLink: "https://outlook/x",
        },
      };
    });
    const r = await new MicrosoftCalendarProvider(cfg).createMeeting({
      orgId: orgAId,
      organizerId: aliceId,
      title: "Sync",
      start: "2026-06-20T10:00:00Z",
      end: "2026-06-20T10:30:00Z",
      attendeeEmails: ["bob@x.com"],
      conferencing: true,
    });
    expect(r).toEqual({
      externalEventId: "ev-ms",
      joinUrl: "https://teams/x",
      htmlLink: "https://outlook/x",
    });
    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/me/events"))!;
    expect(create.body).toContain("isOnlineMeeting");
  });

  it("throws when the organizer has not connected a Microsoft calendar", async () => {
    mockFetch(() => ({ json: {} }));
    await expect(
      new MicrosoftCalendarProvider(cfg).createMeeting({
        orgId: orgAId,
        organizerId: "no-conn-user",
        title: "x",
        start: "2026-06-20T10:00:00Z",
        end: "2026-06-20T10:30:00Z",
        attendeeEmails: [],
        conferencing: true,
      }),
    ).rejects.toThrow(/connected a Microsoft calendar/);
  });
});

describe("disconnect", () => {
  it("deletes the stored connection", async () => {
    // Ensure a row exists (created by handleCallback above, but be order-independent).
    mockFetch((c) =>
      isToken(c.url)
        ? { json: { access_token: "at", refresh_token: "ms-rt-9", scope: "s" } }
        : { json: { mail: "alice@acme.test" } },
    );
    await handleCallback(cfg, orgAId, aliceId, "c");
    await disconnect(aliceId);
    expect(await getConnection(aliceId)).toBeNull();
  });
});
