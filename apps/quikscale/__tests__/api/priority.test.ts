import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/priority/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-priority-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/priority${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/priority", {
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

const validBody = {
  name: "Ship v2",
  owner: USER,
  quarter: "Q1",
  year: 2026,
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/priority — auth
// ═══════════════════════════════════════════════

describe("GET /api/priority — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/priority — tenant isolation + happy path
// ═══════════════════════════════════════════════

describe("GET /api/priority — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated priorities scoped to tenant", async () => {
    const mockPriority = {
      id: "p1",
      name: "Ship v2",
      owner: USER,
      quarter: "Q1",
      year: 2026,
      overallStatus: "on-track",
      createdAt: new Date(),
      updatedAt: new Date(),
      owner_user: { id: USER, firstName: "Test", lastName: "User" },
      team: null,
      weeklyStatuses: [],
    };
    mockDb.priority.findMany.mockResolvedValue([mockPriority] as any);
    mockDb.priority.count.mockResolvedValue(1);

    const res = await GET(buildGET("year=2026&quarter=Q1"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    // Verify tenant isolation in the where clause
    expect(mockDb.priority.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — auth
// ═══════════════════════════════════════════════

describe("POST /api/priority — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — Zod validation
// ═══════════════════════════════════════════════

describe("POST /api/priority — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is empty", async () => {
    const res = await POST(buildPOST({ ...validBody, name: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when quarter is invalid", async () => {
    const res = await POST(buildPOST({ ...validBody, quarter: "Q5" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when owner is missing", async () => {
    const res = await POST(buildPOST({ ...validBody, owner: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — happy path
// ═══════════════════════════════════════════════

describe("POST /api/priority — happy path", () => {
  beforeEach(asAdmin);

  it("creates a priority with 201 and writes audit log", async () => {
    const createdPriority = {
      id: "new-p1",
      name: "Ship v2",
      owner: USER,
      quarter: "Q1",
      year: 2026,
      overallStatus: "not-yet-started",
      createdAt: new Date(),
      updatedAt: new Date(),
      owner_user: { id: USER, firstName: "Test", lastName: "User" },
      team: null,
      weeklyStatuses: [],
    };
    mockDb.priority.create.mockResolvedValue(createdPriority as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-p1");

    // Verify audit log was written
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Priority");
  });

  it("stores tenantId and createdBy from the session", async () => {
    mockDb.priority.create.mockResolvedValue({
      id: "new-p2",
      name: "Ship v2",
      owner_user: null,
      team: null,
      weeklyStatuses: [],
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await POST(buildPOST(validBody), { params: {} } as any);

    const createArg = (mockDb.priority.create as any).mock.calls[0][0];
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);
  });
});
