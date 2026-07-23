import "../../../__tests__/helpers/mockDb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetCalendarForTest, getCalendarProvider, selectCalendarMode } from "./index";
import { StubCalendarProvider } from "./stub";
import { bandStyle } from "@/components/chat/FreeBusyGrid";

const GOOGLE_ENV = {
  CALENDAR_MODE: "google",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GMAIL_REFRESH_TOKEN: "rt",
};
const MS_ENV = {
  CALENDAR_MODE: "microsoft",
  MICROSOFT_CLIENT_ID: "id",
  MICROSOFT_CLIENT_SECRET: "secret",
  MICROSOFT_REDIRECT_URI: "https://app/cb",
  CALENDAR_TOKEN_ENC_KEY: "dev-key",
};

describe("selectCalendarMode", () => {
  it("defaults to stub", () => {
    expect(selectCalendarMode({})).toEqual({ mode: "stub" });
    expect(selectCalendarMode({ CALENDAR_MODE: "stub" })).toEqual({ mode: "stub" });
  });

  it("uses google only when all three creds are set", () => {
    expect(selectCalendarMode(GOOGLE_ENV)).toEqual({ mode: "google" });
  });

  it("uses microsoft only when client/secret/redirect/enc-key are set", () => {
    expect(selectCalendarMode(MS_ENV)).toEqual({ mode: "microsoft" });
  });

  it("falls back to stub (with warning) when a provider is misconfigured", () => {
    for (const mode of ["google", "microsoft"]) {
      const r = selectCalendarMode({ CALENDAR_MODE: mode });
      expect(r.mode).toBe("stub");
      expect(r.warning).toBeTruthy();
    }
    // Missing just one google cred still falls back.
    expect(selectCalendarMode({ CALENDAR_MODE: "google", GOOGLE_CLIENT_ID: "id" }).mode).toBe(
      "stub",
    );
    // Missing the MS encryption key falls back.
    const { CALENDAR_TOKEN_ENC_KEY: _omit, ...noKey } = MS_ENV;
    expect(selectCalendarMode(noKey).mode).toBe("stub");
  });
});

describe("StubCalendarProvider", () => {
  const p = new StubCalendarProvider();
  const win = { orgId: "o1", from: "2026-06-20T00:00:00.000Z", to: "2026-06-20T23:59:59.999Z" };

  it("free/busy is deterministic per (email, day)", async () => {
    const a = await p.getFreeBusy({ ...win, userEmails: ["x@acme.com"] });
    const b = await p.getFreeBusy({ ...win, userEmails: ["x@acme.com"] });
    expect(a).toEqual(b);
    expect(a["x@acme.com"]!.length).toBeGreaterThan(0);
    // Each block is a valid start<end interval inside the day.
    for (const blk of a["x@acme.com"]!) {
      expect(Date.parse(blk.end)).toBeGreaterThan(Date.parse(blk.start));
    }
  });

  it("different users get different busy blocks", async () => {
    const out = await p.getFreeBusy({ ...win, userEmails: ["a@acme.com", "b@acme.com"] });
    expect(out["a@acme.com"]).not.toEqual(out["b@acme.com"]);
  });

  it("createMeeting returns a synthetic event + a Meet link when conferencing", async () => {
    const r = await p.createMeeting({
      orgId: "o1",
      organizerId: "u1",
      title: "Sync",
      start: win.from,
      end: win.to,
      attendeeEmails: ["a@acme.com"],
      conferencing: true,
    });
    expect(r.externalEventId).toMatch(/^stub-evt-/);
    expect(r.joinUrl).toMatch(/^https:\/\/meet\.stub\//);
    expect(r.htmlLink).toMatch(/^https:\/\/calendar\.stub\//);
  });

  it("omits the join link when conferencing is off", async () => {
    const r = await p.createMeeting({
      orgId: "o1",
      organizerId: "u1",
      title: "No call",
      start: win.from,
      end: win.to,
      attendeeEmails: [],
      conferencing: false,
    });
    expect(r.joinUrl).toBeNull();
  });

  it("setRsvp / cancel are no-ops that succeed", async () => {
    await expect(
      p.setRsvp({
        orgId: "o1",
        externalEventId: "e1",
        userEmail: "a@acme.com",
        status: "accepted",
      }),
    ).resolves.toBeUndefined();
    await expect(p.cancel({ orgId: "o1", externalEventId: "e1" })).resolves.toBeUndefined();
  });
});

describe("getCalendarProvider boot health check (S16)", () => {
  afterEach(() => {
    __resetCalendarForTest();
    for (const k of [
      "CALENDAR_MODE",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
    ])
      delete process.env[k];
    vi.restoreAllMocks();
  });

  it("falls back to the stub when Google's token/scope probe fails (no 500)", async () => {
    Object.assign(process.env, GOOGLE_ENV);
    __resetCalendarForTest();
    // Token refresh 400 → verify() unhealthy → degrade to stub (like Microsoft).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }) as Response),
    );
    const provider = await getCalendarProvider();
    expect(provider).toBeInstanceOf(StubCalendarProvider);
  });
});

describe("bandStyle (free/busy positioning)", () => {
  it("clamps intervals outside the window to null", () => {
    expect(bandStyle(0, 60)).toBeNull(); // before 08:00
    expect(bandStyle(8 * 60, 9 * 60)).toMatchObject({ left: 0 });
  });
});
