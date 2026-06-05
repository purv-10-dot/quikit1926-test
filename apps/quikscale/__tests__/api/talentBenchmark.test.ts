import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/performance/talent/benchmark/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-talent-1";
const params = { params: {} as never };

function buildGET(): NextRequest {
  return new NextRequest("http://localhost/api/performance/talent/benchmark", { method: "GET" });
}

function buildPUT(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/performance/talent/benchmark", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/**
 * Seed the auth + tenant resolution that `withOrgAuthForModule("people.talent")`
 * performs (session → getOrgId → membership + app-access). `role` is the legacy
 * `OrgMember.role`; `v2Admin` controls whether a dynamic-RBAC v2 system-admin
 * grant exists. The two are independent on purpose — that gap is the bug under test.
 */
function seedAuth(opts: { role: string; v2Admin: boolean; isSuperAdmin?: boolean }) {
  setSession({
    id: USER,
    orgId: TENANT,
    role: opts.role as never,
    ...(opts.isSuperAdmin ? { isSuperAdmin: true } : {}),
  } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: opts.role,
    status: "active",
  } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app1", slug: "quikscale" } as never);
  mockDb.userAppAccess.findUnique.mockResolvedValue({ id: "access1" } as never);
  mockDb.userAppRole.findFirst.mockResolvedValue(
    opts.v2Admin ? ({ id: "uar1" } as never) : null,
  );
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════════════
// PUT /api/performance/talent/benchmark — auth
// ═══════════════════════════════════════════════════════

describe("PUT /api/performance/talent/benchmark — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(buildPUT({ perfCut: 60, potentialCut: 60 }), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a plain member with no admin grant", async () => {
    seedAuth({ role: "member", v2Admin: false });
    const res = await PUT(buildPUT({ perfCut: 60, potentialCut: 60 }), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/org admins/i);
  });

  // Regression: admins promoted via Org Setup → User Management keep
  // `OrgMember.role = "member"` and are tracked only by the dynamic-RBAC v2
  // `UserAppRole` grant. The legacy-only tier check used to 403 them here.
  it("allows a v2 system-admin whose legacy OrgMember.role is still 'member'", async () => {
    seedAuth({ role: "member", v2Admin: true });
    mockDb.talentBenchmark.upsert.mockResolvedValue({
      perfCut: 60,
      potentialCut: 60,
      updatedAt: new Date("2026-06-05T00:00:00Z"),
    } as never);

    const res = await PUT(buildPUT({ perfCut: 60, potentialCut: 60 }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.perfCut).toBe(60);
    expect(mockDb.talentBenchmark.upsert).toHaveBeenCalledOnce();
  });

  it("allows a legacy admin role without a v2 grant", async () => {
    seedAuth({ role: "admin", v2Admin: false });
    mockDb.talentBenchmark.upsert.mockResolvedValue({
      perfCut: 70,
      potentialCut: 70,
      updatedAt: new Date("2026-06-05T00:00:00Z"),
    } as never);

    const res = await PUT(buildPUT({ perfCut: 70, potentialCut: 70 }), params);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════
// PUT /api/performance/talent/benchmark — validation
// ═══════════════════════════════════════════════════════

describe("PUT /api/performance/talent/benchmark — validation", () => {
  beforeEach(() => seedAuth({ role: "member", v2Admin: true }));

  it("returns 400 when perfCut is out of range", async () => {
    const res = await PUT(buildPUT({ perfCut: 150, potentialCut: 60 }), params);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/performance/talent/benchmark — happy path
// ═══════════════════════════════════════════════════════

describe("GET /api/performance/talent/benchmark", () => {
  it("returns stored benchmark for a non-admin (read is not gated)", async () => {
    seedAuth({ role: "member", v2Admin: false });
    mockDb.talentBenchmark.findUnique.mockResolvedValue({
      perfCut: 55,
      potentialCut: 45,
      updatedAt: new Date("2026-06-05T00:00:00Z"),
    } as never);

    const res = await GET(buildGET(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.perfCut).toBe(55);
    expect(body.data.isDefault).toBe(false);
  });

  it("falls back to defaults when no row exists", async () => {
    seedAuth({ role: "member", v2Admin: false });
    mockDb.talentBenchmark.findUnique.mockResolvedValue(null);

    const res = await GET(buildGET(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isDefault).toBe(true);
  });
});
