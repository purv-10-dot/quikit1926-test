import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";

const db = mockDb as any;

// The Whitebooks GST verify feature is env-gated on
//   WHITEBOOKS_ACCOUNT_EMAIL + WHITEBOOKS_CLIENT_ID + WHITEBOOKS_CLIENT_SECRET
// When all three are set the helper hits the Whitebooks sandbox over `fetch`,
// so we stub global fetch and never touch the network.
const WB_ENV = {
  WHITEBOOKS_ACCOUNT_EMAIL: "acct@test.io",
  WHITEBOOKS_CLIENT_ID: "cid",
  WHITEBOOKS_CLIENT_SECRET: "csecret",
};

function enableWhitebooks() {
  process.env.WHITEBOOKS_ACCOUNT_EMAIL = WB_ENV.WHITEBOOKS_ACCOUNT_EMAIL;
  process.env.WHITEBOOKS_CLIENT_ID = WB_ENV.WHITEBOOKS_CLIENT_ID;
  process.env.WHITEBOOKS_CLIENT_SECRET = WB_ENV.WHITEBOOKS_CLIENT_SECRET;
}

function disableWhitebooks() {
  delete process.env.WHITEBOOKS_ACCOUNT_EMAIL;
  delete process.env.WHITEBOOKS_CLIENT_ID;
  delete process.env.WHITEBOOKS_CLIENT_SECRET;
}

function fetchReturning(json: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => json,
  });
}

import { GET as CONFIG_GET } from "@/app/api/integrations/whitebooks/config/route";
import { POST as VENDOR_GST_POST } from "@/app/api/integrations/whitebooks/vendor-gst/route";

function configGET(): NextRequest {
  return new NextRequest("http://localhost/api/integrations/whitebooks/config", { method: "GET" });
}
function vendorPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/integrations/whitebooks/vendor-gst", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  disableWhitebooks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  disableWhitebooks();
});

// ═══════════════════════════════════════════════
// GET /api/integrations/whitebooks/config
// ═══════════════════════════════════════════════

describe("GET /api/integrations/whitebooks/config", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await CONFIG_GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user holds no vendor-picker permission", async () => {
    setContext(makeUserCtx([]));
    const res = await CONFIG_GET();
    expect(res.status).toBe(403);
  });

  it("reports gstVerifyEnabled:false when env is not configured", async () => {
    setContext(makeAdminCtx());
    const res = await CONFIG_GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.gstVerifyEnabled).toBe(false);
  });

  it("reports gstVerifyEnabled:true when the WHITEBOOKS_* env is set", async () => {
    enableWhitebooks();
    setContext(makeAdminCtx());
    const res = await CONFIG_GET();
    const body = await res.json();
    expect(body.data.gstVerifyEnabled).toBe(true);
  });

  it("allows a scoped user holding a single vendor-picker key", async () => {
    setContext(makeUserCtx(["construction.po.view"]));
    const res = await CONFIG_GET();
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════
// POST /api/integrations/whitebooks/vendor-gst
// ═══════════════════════════════════════════════

describe("POST /api/integrations/whitebooks/vendor-gst — feature off", () => {
  it("short-circuits to skipped/not_configured BEFORE auth when env is unset", async () => {
    // No context set — yet the not-configured path returns 200, never 401.
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.skipped).toBe(true);
    expect(body.data.reason).toBe("not_configured");
    expect(body.data.active).toBe(true);
  });
});

describe("POST /api/integrations/whitebooks/vendor-gst — feature on", () => {
  beforeEach(() => enableWhitebooks());

  it("returns 401 when unauthenticated (feature on)", async () => {
    vi.stubGlobal("fetch", fetchReturning({}));
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks every vendor-picker permission", async () => {
    setContext(makeUserCtx([]));
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when vendorId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await VENDOR_GST_POST(vendorPOST({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the vendor is not found in the caller's org", async () => {
    setContext(makeAdminCtx());
    db.cnVendor.findFirst.mockResolvedValue(null);
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(404);
    // vendor lookup is org-scoped
    expect(db.cnVendor.findFirst.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("returns active:true when Whitebooks reports an active GST", async () => {
    setContext(makeAdminCtx());
    db.cnVendor.findFirst.mockResolvedValue({ id: "v1", gstin: "27ABCDE1234F1Z5" });
    vi.stubGlobal(
      "fetch",
      fetchReturning({ status_cd: "1", data: { sts: "Active", gstin: "27ABCDE1234F1Z5" } }),
    );
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.active).toBe(true);
    expect(body.data.skipped).toBe(false);
    expect(body.data.statusLabel).toBe("Active");
  });

  it("returns active:false with a message when GST is cancelled", async () => {
    setContext(makeAdminCtx());
    db.cnVendor.findFirst.mockResolvedValue({ id: "v1", gstin: "27ABCDE1234F1Z5" });
    vi.stubGlobal(
      "fetch",
      fetchReturning({ status_cd: "1", data: { sts: "Cancelled", gstin: "27ABCDE1234F1Z5" } }),
    );
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.active).toBe(false);
    expect(body.data.message).toBeTruthy();
  });

  it("returns 502 when the Whitebooks fetch throws (network error)", async () => {
    setContext(makeAdminCtx());
    db.cnVendor.findFirst.mockResolvedValue({ id: "v1", gstin: "27ABCDE1234F1Z5" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const res = await VENDOR_GST_POST(vendorPOST({ vendorId: "v1" }));
    expect(res.status).toBe(502);
  });
});
