import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/geo/opencage/route";

// The route proxies the OpenCage forward-geocode API over global `fetch`,
// gated on OPENCAGE_API_KEY. We never hit the network — stub fetch and the
// env var per test.

function setKey() {
  process.env.OPENCAGE_API_KEY = "test-key";
}
function clearKey() {
  delete process.env.OPENCAGE_API_KEY;
}

function fetchReturning(json: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => json,
  });
}

function reqGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/geo/opencage${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/geo/opencage", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const MAHARASHTRA_RESULT = {
  results: [
    {
      formatted: "Pune, Maharashtra, India",
      components: { state: "Maharashtra", city: "Pune", state_code: "MH" },
    },
  ],
  status: { code: 200 },
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
  clearKey();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearKey();
});

// ═══════════════════════════════════════════════
// GET /api/geo/opencage — autocomplete
// ═══════════════════════════════════════════════

describe("GET /api/geo/opencage", () => {
  it("returns 401 when unauthenticated", async () => {
    setKey();
    const res = await GET(reqGET("q=Pune"));
    expect(res.status).toBe(401);
  });

  it("returns 503 when OPENCAGE_API_KEY is unset", async () => {
    setContext(makeAdminCtx());
    const res = await GET(reqGET("q=Pune"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it("returns empty suggestions for a query under 3 chars (no fetch)", async () => {
    setContext(makeAdminCtx());
    setKey();
    const f = fetchReturning(MAHARASHTRA_RESULT);
    vi.stubGlobal("fetch", f);
    const res = await GET(reqGET("q=Pu"));
    expect(res.status).toBe(200);
    expect((await res.json()).suggestions).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("returns mapped suggestions on a successful geocode", async () => {
    setContext(makeAdminCtx());
    setKey();
    vi.stubGlobal("fetch", fetchReturning(MAHARASHTRA_RESULT));
    const res = await GET(reqGET("q=Pune"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].formatted).toBe("Pune, Maharashtra, India");
    expect(body.suggestions[0].state).toBe("Maharashtra");
  });

  it("returns 502 when the upstream fetch fails", async () => {
    setContext(makeAdminCtx());
    setKey();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await GET(reqGET("q=Pune"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the upstream returns a non-ok HTTP status", async () => {
    setContext(makeAdminCtx());
    setKey();
    vi.stubGlobal("fetch", fetchReturning({}, { ok: false, status: 500 }));
    const res = await GET(reqGET("q=Pune"));
    expect(res.status).toBe(502);
  });
});

// ═══════════════════════════════════════════════
// POST /api/geo/opencage — resolve state/city
// ═══════════════════════════════════════════════

describe("POST /api/geo/opencage", () => {
  it("returns 401 when unauthenticated", async () => {
    setKey();
    const res = await POST(reqPOST({ query: "Pune Maharashtra" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when OPENCAGE_API_KEY is unset", async () => {
    setContext(makeAdminCtx());
    const res = await POST(reqPOST({ query: "Pune Maharashtra" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when the query is under 4 chars", async () => {
    setContext(makeAdminCtx());
    setKey();
    const res = await POST(reqPOST({ query: "Pu" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    setContext(makeAdminCtx());
    setKey();
    const bad = new NextRequest("http://localhost/api/geo/opencage", {
      method: "POST",
      body: "not-json{",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("resolves state + city on a successful geocode", async () => {
    setContext(makeAdminCtx());
    setKey();
    vi.stubGlobal("fetch", fetchReturning(MAHARASHTRA_RESULT));
    const res = await POST(reqPOST({ query: "Pune Maharashtra" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("Maharashtra");
  });

  it("returns null state/city when OpenCage reports no results", async () => {
    setContext(makeAdminCtx());
    setKey();
    vi.stubGlobal(
      "fetch",
      fetchReturning({ results: [], status: { code: 200 } }),
    );
    const res = await POST(reqPOST({ query: "ZZZZ nowhere" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBeNull();
    expect(body.city).toBeNull();
  });
});
