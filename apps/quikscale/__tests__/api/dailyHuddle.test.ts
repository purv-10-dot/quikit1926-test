import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/daily-huddle/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-huddle-1";

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/daily-huddle${qs ? "?" + qs : ""}`, { method: "GET" });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/daily-huddle", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

const validHuddle = {
  meetingDate: "2026-04-14",
  callStatus: "completed",
  clientName: "Acme Corp",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/daily-huddle — auth
// ═══════════════════════════════════════════════

describe("GET /api/daily-huddle — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/daily-huddle — happy path
// ═══════════════════════════════════════════════

describe("GET /api/daily-huddle — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated huddles for tenant", async () => {
    const now = new Date();
    const items = [
      {
        id: "h1",
        tenantId: TENANT,
        meetingDate: now,
        callStatus: "completed",
        clientName: "Acme",
        createdAt: now,
        updatedAt: now,
      },
    ];
    mockDb.dailyHuddle.findMany.mockResolvedValue(items as any);
    mockDb.dailyHuddle.count.mockResolvedValue(1);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });

  it("filters by tenantId", async () => {
    mockDb.dailyHuddle.findMany.mockResolvedValue([]);
    mockDb.dailyHuddle.count.mockResolvedValue(0);

    await GET(buildGET(), { params: {} as any });

    const call = mockDb.dailyHuddle.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.tenantId).toBe(TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/daily-huddle — auth
// ═══════════════════════════════════════════════

describe("POST /api/daily-huddle — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validHuddle), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validHuddle), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/daily-huddle — validation
// ═══════════════════════════════════════════════

describe("POST /api/daily-huddle — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when meetingDate is empty", async () => {
    const res = await POST(
      buildPOST({ ...validHuddle, meetingDate: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when callStatus is empty", async () => {
    const res = await POST(
      buildPOST({ ...validHuddle, callStatus: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/daily-huddle — happy path
// ═══════════════════════════════════════════════

describe("POST /api/daily-huddle — happy path", () => {
  beforeEach(asAdmin);

  it("creates huddle and returns 201", async () => {
    const now = new Date();
    const created = {
      id: "h1",
      tenantId: TENANT,
      meetingDate: now,
      callStatus: "completed",
      clientName: "Acme Corp",
      createdBy: USER,
      createdAt: now,
      updatedAt: now,
    };
    mockDb.dailyHuddle.create.mockResolvedValue(created as any);

    const res = await POST(buildPOST(validHuddle), { params: {} as any });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("h1");
  });

  it("scopes creation to tenant and sets createdBy", async () => {
    const now = new Date();
    mockDb.dailyHuddle.create.mockResolvedValue({
      id: "h1",
      meetingDate: now,
      createdAt: now,
      updatedAt: now,
    } as any);

    await POST(buildPOST(validHuddle), { params: {} as any });

    const call = mockDb.dailyHuddle.create.mock.calls[0]?.[0] as any;
    expect(call.data.tenantId).toBe(TENANT);
    expect(call.data.createdBy).toBe(USER);
  });
});
