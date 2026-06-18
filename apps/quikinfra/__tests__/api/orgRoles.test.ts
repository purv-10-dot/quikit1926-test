import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// org/roles routes gate via `requireAdmin()` from "@/lib/rbac/requireAdmin"
// (the shared createRequireAdmin factory + a v2 CnUserAppRole bridge), NOT
// the `@/lib/auth/context` surface the harness mocks. We mock the gate
// directly: returns `{ error: <NextResponse> }` on 401/403, or
// `{ orgId, userId }` on success — exactly the union the route narrows with
// `"error" in ctxOrResponse`. `getQuikInfraAppId` is mocked to a fixed app id.
// ───────────────────────────────────────────────────────────────────
type AdminState =
  | { error: NextResponse }
  | { orgId: string; userId: string }
  | null;
const _admin: { state: AdminState } = { state: null };

function setAdmin(state: AdminState) {
  _admin.state = state;
}
const unauthorized = () =>
  NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

vi.mock("@/lib/rbac/requireAdmin", () => ({
  requireAdmin: vi.fn(async () => {
    if (!_admin.state) return { error: unauthorized() };
    return _admin.state;
  }),
}));

vi.mock("@/lib/rbac/userCan", () => ({
  getQuikInfraAppId: vi.fn(async () => "app-quikinfra-1"),
}));

const db = mockDb as any;

const { GET, POST } = await import("@/app/api/org/roles/route");

function reqGET(): NextRequest {
  return new NextRequest("http://localhost/api/org/roles", { method: "GET" });
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/org/roles", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setAdmin(null);
  db.cnAppRole.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/org/roles
// ═══════════════════════════════════════════════

describe("GET /api/org/roles", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await GET())!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    setAdmin({ error: forbidden() });
    const res = (await GET())!;
    expect(res.status).toBe(403);
  });

  it("lists roles scoped to the org + app with derived counts", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findMany.mockResolvedValue([
      {
        id: "r1",
        name: "admin",
        description: "System admin",
        isSystem: true,
        isDefault: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        _count: { members: 2, rolePermissions: 40 },
      },
    ]);
    const res = (await GET())!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].memberCount).toBe(2);
    expect(body.data[0].permissionCount).toBe(40);
    expect(typeof body.data[0].createdAt).toBe("string");

    const where = db.cnAppRole.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.appId).toBe("app-quikinfra-1");
  });
});

// ═══════════════════════════════════════════════
// POST /api/org/roles
// ═══════════════════════════════════════════════

describe("POST /api/org/roles", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await POST(reqPOST({ name: "Viewer" })))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    setAdmin({ error: forbidden() });
    const res = (await POST(reqPOST({ name: "Viewer" })))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing/blank", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = (await POST(reqPOST({ name: "   " })))!;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("creates a role scoped to the org + app and returns 201", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.create.mockResolvedValue({
      id: "r9",
      name: "Viewer",
      description: null,
      isSystem: false,
      isDefault: false,
      createdAt: new Date("2026-02-02T00:00:00Z"),
    });
    const res = (await POST(reqPOST({ name: "Viewer", description: "read only" })))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("r9");
    expect(body.data.memberCount).toBe(0);
    expect(body.data.permissionCount).toBe(0);

    const data = db.cnAppRole.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.appId).toBe("app-quikinfra-1");
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Viewer");
    expect(data.isSystem).toBe(false);
  });

  it("maps a Prisma unique-constraint violation to 409", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.create.mockRejectedValue(new Error("Unique constraint failed on name"));
    const res = (await POST(reqPOST({ name: "admin" })))!;
    expect(res.status).toBe(409);
  });
});
