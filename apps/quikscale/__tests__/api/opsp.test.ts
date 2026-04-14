import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, POST } from "@/app/api/opsp/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-opsp-1";
const params = { params: {} as never };

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/opsp${qs ? "?" + qs : ""}`, { method: "GET" });
}

function buildPUT(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opsp", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opsp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAuthed() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  // withTenantAuth calls getTenantId which calls membership.findFirst
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as never);
  // getTenantId also checks app access
  mockDb.app.findUnique.mockResolvedValue({ id: "app1", slug: "quikscale" } as never);
  mockDb.userAppAccess.findUnique.mockResolvedValue({ id: "access1" } as never);
  // GET route fetches tenant for fiscalYearStart
  mockDb.tenant.findUnique.mockResolvedValue({ id: TENANT, fiscalYearStart: 4 } as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/opsp — auth
// ═══════════════════════════════════════════════

describe("GET /api/opsp — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/opsp — happy path
// ═══════════════════════════════════════════════

describe("GET /api/opsp — happy path", () => {
  beforeEach(asAuthed);

  it("returns null data when no OPSP record exists", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(null);

    const res = await GET(buildGET("year=2026&quarter=Q1"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    expect(body.fiscalYearStart).toBe(4);
  });

  it("returns existing OPSP data for year/quarter", async () => {
    const mockData = { id: "opsp-1", year: 2026, quarter: "Q1", status: "draft" };
    mockDb.oPSPData.findUnique.mockResolvedValue(mockData as never);

    const res = await GET(buildGET("year=2026&quarter=Q2"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(mockData);
  });
});

// ═══════════════════════════════════════════════
// PUT /api/opsp (upsert) — auth
// ═══════════════════════════════════════════════

describe("PUT /api/opsp — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(buildPUT({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await PUT(buildPUT({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// PUT /api/opsp — validation
// ═══════════════════════════════════════════════

describe("PUT /api/opsp — validation", () => {
  beforeEach(asAuthed);

  it("returns 400 when quarter is invalid", async () => {
    const res = await PUT(buildPUT({ year: 2026, quarter: "Q5" }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when year is missing", async () => {
    const res = await PUT(buildPUT({ quarter: "Q1" }), params);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// PUT /api/opsp — happy path
// ═══════════════════════════════════════════════

describe("PUT /api/opsp — happy path", () => {
  beforeEach(asAuthed);

  it("upserts OPSP data and returns success", async () => {
    const upserted = { id: "opsp-1", year: 2026, quarter: "Q1", status: "draft" };
    mockDb.oPSPData.upsert.mockResolvedValue(upserted as never);
    mockDb.auditLog.create.mockResolvedValue({} as never);

    const res = await PUT(buildPUT({ year: 2026, quarter: "Q1", coreValues: ["Integrity"] }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(upserted);
    expect(body.savedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// POST /api/opsp (finalize) — auth
// ═══════════════════════════════════════════════

describe("POST /api/opsp (finalize) — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/opsp (finalize) — validation
// ═══════════════════════════════════════════════

describe("POST /api/opsp (finalize) — validation", () => {
  beforeEach(asAuthed);

  it("returns 400 when quarter is invalid", async () => {
    const res = await POST(buildPOST({ year: 2026, quarter: "Q9" }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// POST /api/opsp (finalize) — happy path
// ═══════════════════════════════════════════════

describe("POST /api/opsp (finalize) — happy path", () => {
  beforeEach(asAuthed);

  it("finalizes OPSP and returns 201", async () => {
    mockDb.oPSPData.updateMany.mockResolvedValue({ count: 1 } as never);
    mockDb.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(buildPOST({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(1);
  });
});
