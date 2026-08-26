import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReportSettings,
  isValidEmail,
  saveReportSettings,
  sendReportNow,
} from "@/lib/api/reports";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

afterEach(() => fetchMock.mockReset());

describe("isValidEmail", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail(" A@B.CO ")).toBe(true); // trimmed + lowercased
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.co")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("getReportSettings", () => {
  it("unwraps the settings envelope", async () => {
    fetchMock.mockReturnValue(
      json({ settings: { enabled: true, recipients: ["a@b.co"], frequency: "WEEKLY", lastSentAt: null } }),
    );
    await expect(getReportSettings()).resolves.toEqual({
      enabled: true, recipients: ["a@b.co"], frequency: "WEEKLY", lastSentAt: null,
    });
  });

  it("surfaces the server's error message", async () => {
    fetchMock.mockReturnValue(json({ error: "Unauthorized" }, false, 401));
    await expect(getReportSettings()).rejects.toThrow("Unauthorized");
  });

  it("falls back to a status message when the body has no error field", async () => {
    fetchMock.mockReturnValue(json({}, false, 500));
    await expect(getReportSettings()).rejects.toThrow(/500/);
  });
});

describe("saveReportSettings", () => {
  it("PUTs the payload", async () => {
    fetchMock.mockReturnValue(
      json({ settings: { enabled: false, recipients: [], frequency: "DAILY", lastSentAt: null } }),
    );
    await saveReportSettings({ enabled: false, recipients: [], frequency: "DAILY" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/insights/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ enabled: false, recipients: [], frequency: "DAILY" });
  });

  it("propagates the specific validation error rather than a generic one", async () => {
    fetchMock.mockReturnValue(
      json({ error: "Add at least one recipient before enabling the report" }, false, 400),
    );
    await expect(
      saveReportSettings({ enabled: true, recipients: [], frequency: "WEEKLY" }),
    ).rejects.toThrow("Add at least one recipient before enabling the report");
  });
});

describe("sendReportNow", () => {
  it("reports success with the server's recipient list", async () => {
    fetchMock.mockReturnValue(json({ sent: true, recipients: ["a@b.co"] }));
    await expect(sendReportNow()).resolves.toEqual({
      sent: true, recipients: ["a@b.co"], reason: undefined,
    });
  });

  it("treats a 200 with sent:false as NOT sent", async () => {
    // The route answers 200 + a reason when no platform is connected. Assuming
    // success from the status code alone would tell the user an email went out
    // when none did.
    fetchMock.mockReturnValue(
      json({ sent: false, reason: "No connected platforms — connect a platform to receive insights." }),
    );
    const result = await sendReportNow();
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/No connected platforms/);
  });

  it("omits `to` entirely when none is given, so the server picks the defaults", async () => {
    fetchMock.mockReturnValue(json({ sent: true, recipients: ["me@x.co"] }));
    await sendReportNow();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it("passes an explicit recipient list through", async () => {
    fetchMock.mockReturnValue(json({ sent: true, recipients: ["x@y.co"] }));
    await sendReportNow(["x@y.co"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ to: ["x@y.co"] });
  });

  it("throws on a transport failure", async () => {
    fetchMock.mockReturnValue(json({ error: "SMTP refused" }, false, 502));
    await expect(sendReportNow()).rejects.toThrow("SMTP refused");
  });
});
