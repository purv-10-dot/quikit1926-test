import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// /api/me uses requireAuth() from "@/lib/auth/context" (harness-mocked, driven
// by setContext) — any authenticated user passes, no permission gate. It
// returns the resolved tenant context (permissions materialized to an array,
// matrix derived from modules when none stored).
//
// /api/me/permissions is withOrgAuth-wrapped (NextAuth + getTenantId + seed)
// and returns loadMyPermissions() — the v2 RBAC resolution
// { isAdmin, roleId, roleName, permissions[], extras[] }. We mock the wrapper
// (passthrough: 401 when unauth, else inject { userId, orgId }), the seeder
// (best-effort no-op), and loadMyPermissions itself.
// ───────────────────────────────────────────────────────────────────
const _auth: { ctx: { orgId: string; userId: string } | null } = { ctx: null };
function setAuth(ctx: { orgId: string; userId: string } | null) {
  _auth.ctx = ctx;
}
vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any) =>
    async (req: NextRequest, routeCtx: any) => {
      if (!_auth.ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      try {
        return await handler(
          { session: {}, userId: _auth.ctx.userId, orgId: _auth.ctx.orgId },
          req,
          routeCtx ?? { params: {} },
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    };
  return {
    withOrgAuth: (h: any) => wrap(h),
    withOrgAuthForModule: () => (h: any) => wrap(h),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const _perms: { load: (u: string, o: string) => Promise<unknown> } = {
  load: async () => ({
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    extras: [],
  }),
};
vi.mock("@/lib/rbac/userCan", () => ({
  loadMyPermissions: (u: string, o: string) => _perms.load(u, o),
  getQuikInfraAppId: vi.fn(async () => "app-quikinfra-1"),
}));
vi.mock("@/lib/rbac/seedDefaultRoles", () => ({
  seedDefaultRoles: vi.fn(async () => null),
  ensureUserOnRole: vi.fn(async () => {}),
}));

const db = mockDb as any;

const meRoute = await import("@/app/api/me/route");
const mePermRoute = await import("@/app/api/me/permissions/route");

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET" });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  setAuth(null);
  _perms.load = async () => ({
    isAdmin: false,
    roleId: null,
    roleName: null,
    permissions: [],
    extras: [],
  });
});

// ═══════════════════════════════════════════════
// GET /api/me
// ═══════════════════════════════════════════════

describe("GET /api/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await meRoute.GET();
    expect(res.status).toBe(401);
  });

  it("returns the current context for an admin (wildcard materialized)", async () => {
    setContext(makeAdminCtx());
    const res = await meRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(TEST_USER);
    expect(body.orgId).toBe(TEST_TENANT);
    expect(body.roleKey).toBe("admin");
    expect(body.permissions).toContain("*");
    // admins / wildcard holders get a null matrix
    expect(body.permissionMatrix).toBeNull();
  });

  it("returns a flat permission list for a scoped user", async () => {
    setContext(makeUserCtx(["construction.boq.view", "construction.boq.edit"]));
    const res = await meRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.permissions).toEqual(
      expect.arrayContaining(["construction.boq.view", "construction.boq.edit"]),
    );
    expect(body.projectIds).toBeNull();
  });

  it("derives the matrix from assigned modules when none is stored", async () => {
    setContext(makeUserCtx([], { modulesAssigned: ["masters"] }));
    const res = await meRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // buildMatrixFromModules produced a matrix (not null) for the assigned module
    expect(body.permissionMatrix).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════
// GET /api/me/permissions
// ═══════════════════════════════════════════════

describe("GET /api/me/permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await mePermRoute.GET(req("/api/me/permissions"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns the effective v2 permission set for the caller", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    _perms.load = async (u, o) => {
      expect(u).toBe(TEST_USER);
      expect(o).toBe(TEST_TENANT);
      return {
        isAdmin: true,
        roleId: "r-admin",
        roleName: "admin",
        permissions: ["construction.boq:view", "construction.boq:edit"],
        extras: ["construction.settings:manage"],
      };
    };
    const res = await mePermRoute.GET(req("/api/me/permissions"), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isAdmin).toBe(true);
    expect(body.data.roleName).toBe("admin");
    expect(body.data.permissions).toContain("construction.boq:view");
    expect(body.data.extras).toContain("construction.settings:manage");
  });

  it("still resolves permissions even if the seeder throws (best-effort)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const seed = await import("@/lib/rbac/seedDefaultRoles");
    (seed.seedDefaultRoles as any).mockRejectedValueOnce(new Error("seed boom"));
    const res = await mePermRoute.GET(req("/api/me/permissions"), { params: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
