import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/www/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-www-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/www${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/www", {
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
  who: USER,
  what: "Fix the login bug",
  when: "2026-04-15",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/www — auth
// ═══════════════════════════════════════════════

describe("GET /api/www — auth", () => {
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
// GET /api/www — happy path + tenant isolation
// ═══════════════════════════════════════════════

describe("GET /api/www — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated WWW items scoped to tenant", async () => {
    const mockItem = {
      id: "w1",
      who: USER,
      what: "Fix login",
      when: new Date("2026-04-15"),
      status: "not-yet-started",
      notes: null,
      category: null,
      originalDueDate: null,
      revisedDates: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: USER,
      tenantId: TENANT,
    };
    mockDb.wWWItem.findMany.mockResolvedValue([mockItem] as any);
    mockDb.wWWItem.count.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User" },
    ] as any);

    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    // Verify tenant isolation
    expect(mockDb.wWWItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/www — auth
// ═══════════════════════════════════════════════

describe("POST /api/www — auth", () => {
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
// POST /api/www — Zod validation
// ═══════════════════════════════════════════════

describe("POST /api/www — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when who is empty", async () => {
    const res = await POST(buildPOST({ ...validBody, who: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when what is empty", async () => {
    const res = await POST(buildPOST({ ...validBody, what: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when when is missing", async () => {
    const res = await POST(buildPOST({ who: USER, what: "Do something" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/www — happy path
// ═══════════════════════════════════════════════

describe("POST /api/www — happy path", () => {
  beforeEach(asAdmin);

  it("creates a WWW item with 201 and writes audit log", async () => {
    const createdItem = {
      id: "new-w1",
      who: USER,
      what: "Fix the login bug",
      when: new Date("2026-04-15"),
      status: "not-yet-started",
      notes: null,
      category: null,
      originalDueDate: null,
      revisedDates: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: USER,
      tenantId: TENANT,
    };
    mockDb.wWWItem.create.mockResolvedValue(createdItem as any);
    mockDb.user.findUnique.mockResolvedValue({
      id: USER,
      firstName: "Test",
      lastName: "User",
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-w1");
    expect(body.data.who_user).toBeTruthy();

    // Verify audit log
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("WWWItem");
  });

  it("stores tenantId and createdBy from the session", async () => {
    mockDb.wWWItem.create.mockResolvedValue({
      id: "new-w2",
      who: USER,
      what: "x",
      when: new Date(),
      status: "not-yet-started",
      notes: null,
      category: null,
      originalDueDate: null,
      revisedDates: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: USER,
      tenantId: TENANT,
    } as any);
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await POST(buildPOST(validBody), { params: {} } as any);

    const createArg = (mockDb.wWWItem.create as any).mock.calls[0][0];
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);
  });
});
