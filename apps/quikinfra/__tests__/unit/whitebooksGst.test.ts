import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isWhitebooksGstVerifyEnabled,
  lookupGstStatusOnWhitebooks,
  assertVendorGstActiveForPo,
} from "@/lib/integrations/whitebooks-gst";

const ENV_KEYS = [
  "WHITEBOOKS_ACCOUNT_EMAIL",
  "WHITEBOOKS_CLIENT_ID",
  "WHITEBOOKS_CLIENT_SECRET",
  "WHITEBOOKS_API_BASE_URL",
  "WHITEBOOKS_AUTHORIZATION",
  "WHITEBOOKS_GSTN_USERNAME",
];
const saved: Record<string, string | undefined> = {};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function enableEnv() {
  process.env.WHITEBOOKS_ACCOUNT_EMAIL = "acct@example.com";
  process.env.WHITEBOOKS_CLIENT_ID = "cid";
  process.env.WHITEBOOKS_CLIENT_SECRET = "secret";
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("isWhitebooksGstVerifyEnabled", () => {
  it("false when creds missing", () => {
    expect(isWhitebooksGstVerifyEnabled()).toBe(false);
  });
  it("true when all three creds present", () => {
    enableEnv();
    expect(isWhitebooksGstVerifyEnabled()).toBe(true);
  });
});

describe("lookupGstStatusOnWhitebooks", () => {
  it("skips when not configured (no network call)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r).toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not-active with message when GSTIN is blank", async () => {
    enableEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await lookupGstStatusOnWhitebooks("");
    expect(r).toMatchObject({ ok: true, skipped: false, active: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an ACTIVE status and sends client_id / client_secret headers + email+gstin query", async () => {
    enableEnv();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ status_cd: "1", data: { sts: "Active", gstin: "22AAAAA0000A1Z5" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await lookupGstStatusOnWhitebooks("22aaaaa0000a1z5");
    expect(r).toMatchObject({ ok: true, skipped: false, active: true, statusLabel: "Active" });

    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url as unknown as string).toContain("/public/search?");
    expect(url as unknown as string).toContain("gstin=22AAAAA0000A1Z5"); // normalized + uppercased
    expect(url as unknown as string).toContain("email=acct%40example.com");
    expect((init as any).headers.client_id).toBe("cid");
    expect((init as any).headers.client_secret).toBe("secret");
  });

  it("maps a CANCELLED status to active:false with a PO-blocking message", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "1", data: { sts: "Cancelled" } }),
    ));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r).toMatchObject({ ok: true, skipped: false, active: false });
    if (r.ok && !("skipped" in r && r.skipped) && "message" in r) {
      expect(r.message).toMatch(/cannot be used on a PO/i);
    }
  });

  it("treats a cancellation date with no status as Cancelled", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "1", data: { cxdt: "2024-01-01" } }),
    ));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r).toMatchObject({ active: false, statusLabel: "Cancelled" });
  });

  it("returns ok:false on a thrown fetch error", async () => {
    enableEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      }),
    );
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Could not reach Whitebooks/i);
  });

  it("returns ok:false on invalid JSON", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "<html>",
    })));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/invalid response/i);
  });

  it("returns ok:false on a non-ok HTTP status", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 503)));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/HTTP 503/);
  });

  it("surfaces a credential error message when data is missing and desc mentions client id", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "0", status_desc: "Invalid client id" }),
    ));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/client_id and client_secret/);
  });

  it("returns active:false when data is missing and desc is generic", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "1", status_desc: "No record found" }),
    ));
    const r = await lookupGstStatusOnWhitebooks("22AAAAA0000A1Z5");
    expect(r).toMatchObject({ ok: true, skipped: false, active: false });
  });
});

describe("assertVendorGstActiveForPo", () => {
  it("ok when verification is skipped (not configured)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await assertVendorGstActiveForPo("22AAAAA0000A1Z5")).toEqual({ ok: true });
  });

  it("ok when active", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "1", data: { sts: "Active" } }),
    ));
    expect(await assertVendorGstActiveForPo("22AAAAA0000A1Z5")).toEqual({ ok: true });
  });

  it("not-ok with a message when cancelled", async () => {
    enableEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ status_cd: "1", data: { sts: "Cancelled" } }),
    ));
    const r = await assertVendorGstActiveForPo("22AAAAA0000A1Z5");
    expect(r.ok).toBe(false);
  });
});
