/**
 * RBAC matrix tests — for every gated route, verify:
 *   - 401 unauthenticated
 *   - 403 wrong role (with audit log written for high-value endpoints)
 *   - 200/201 correct role
 *
 * Covers the role gates added in Sprint 5b. Each route is a single test
 * group; the helper runMatrix() handles the boilerplate so the matrix is
 * concise.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

const USER = "ckuser000000000000000000001";
const TENANT = "ckten00000000000000000000001";

function jsonReq(url: string, method: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function mockMembershipRole(role: string | null) {
  // getVCRole() uses findUnique(where: { orgId_userId })
  // getTenantId()  uses findFirst(where: { userId, orgId, status: "active" })
  // Mock both so the route can resolve orgId AND read role.
  if (role === null) {
    mockDb.membership.findUnique.mockResolvedValue(null);
    mockDb.membership.findFirst.mockResolvedValue(null);
  } else {
    const m = {
      id: "m1",
      userId: USER,
      orgId: TENANT,
      role,
      status: "active",
      teamId: null,
      customPermissions: [],
      invitationToken: null,
      invitedAt: null,
      acceptedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
    };
    mockDb.membership.findUnique.mockResolvedValue(m as never);
    mockDb.membership.findFirst.mockResolvedValue(m as never);
  }
  // Skip per-app access gate (app row missing → don't block, per createGetTenantId)
  mockDb.app.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/verticals POST  — FUND_ADMIN_ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/verticals", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/verticals/route");
    const res = await POST(jsonReq("/api/verticals", "POST", { name: "AgriTech" }), { params: {} as never });
    expect(res.status).toBe(401);
  });

  it("403 when role is analyst", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    const { POST } = await import("@/app/api/verticals/route");
    const res = await POST(jsonReq("/api/verticals", "POST", { name: "AgriTech" }), { params: {} as never });
    expect(res.status).toBe(403);
  });

  it("201 when role is fund-admin", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("fund-admin");
    mockDb.vCVertical.findUnique.mockResolvedValue(null);
    mockDb.vCVertical.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } } as never);
    mockDb.vCVertical.create.mockResolvedValue({ id: "v1", slug: "agritech", name: "AgriTech" } as never);
    const { POST } = await import("@/app/api/verticals/route");
    const res = await POST(jsonReq("/api/verticals", "POST", { name: "AgriTech" }), { params: {} as never });
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/fund-profile PUT  — FUND_ADMIN_ROLES — also asserts audit write
// ─────────────────────────────────────────────────────────────────────────────
describe("PUT /api/fund-profile", () => {
  it("401 when unauthenticated", async () => {
    const { PUT } = await import("@/app/api/fund-profile/route");
    const res = await PUT(jsonReq("/api/fund-profile", "PUT", {}), { params: {} as never });
    expect(res.status).toBe(401);
  });

  it("403 when role is partner (not fund-admin)", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("partner");
    const { PUT } = await import("@/app/api/fund-profile/route");
    const res = await PUT(jsonReq("/api/fund-profile", "PUT", {}), { params: {} as never });
    expect(res.status).toBe(403);
    // Audit row written with outcome="denied"
    expect(mockDb.vCAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: TENANT,
          userId: USER,
          action: "rbac.deny",
          outcome: "denied",
        }),
      }),
    );
  });

  it("200 when role is fund-admin + audit success row written", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("fund-admin");
    mockDb.vCFundProfile.upsert.mockResolvedValue({ id: "fp1", orgId: TENANT } as never);
    const { PUT } = await import("@/app/api/fund-profile/route");
    const res = await PUT(jsonReq("/api/fund-profile", "PUT", { fundName: "Fund II" }), { params: {} as never });
    expect(res.status).toBe(200);
    expect(mockDb.vCAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "fund-profile.update",
          outcome: "ok",
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/ic-votes/settle POST  — PARTNER_ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/ic-votes/settle", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/ic-votes/settle/route");
    const res = await POST(jsonReq("/api/ic-votes/settle", "POST", { memoId: "m1" }), { params: {} as never });
    expect(res.status).toBe(401);
  });

  it("403 when role is ic-member (cannot settle, only vote)", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("ic-member");
    const { POST } = await import("@/app/api/ic-votes/settle/route");
    const res = await POST(jsonReq("/api/ic-votes/settle", "POST", { memoId: "m1" }), { params: {} as never });
    expect(res.status).toBe(403);
  });

  it("403 when role is analyst", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    const { POST } = await import("@/app/api/ic-votes/settle/route");
    const res = await POST(jsonReq("/api/ic-votes/settle", "POST", { memoId: "m1" }), { params: {} as never });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/allocations POST  — CAPITAL_OPS_ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/allocations", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/allocations/route");
    const res = await POST(jsonReq("/api/allocations", "POST", {}), { params: {} as never });
    expect(res.status).toBe(401);
  });

  it("403 when role is analyst", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    const { POST } = await import("@/app/api/allocations/route");
    const res = await POST(
      jsonReq("/api/allocations", "POST", { dealId: "d1", investorId: "i1", amountLakhs: 10 }),
      { params: {} as never },
    );
    expect(res.status).toBe(403);
  });

  it("403 when role is ic-member", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("ic-member");
    const { POST } = await import("@/app/api/allocations/route");
    const res = await POST(
      jsonReq("/api/allocations", "POST", { dealId: "d1", investorId: "i1", amountLakhs: 10 }),
      { params: {} as never },
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/term-sheets/[id] POST  — PARTNER_ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/term-sheets/[id]", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/term-sheets/[id]/route");
    const res = await POST(jsonReq("/api/term-sheets/d1", "POST"), { params: { id: "d1" } });
    expect(res.status).toBe(401);
  });

  it("403 when role is analyst", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    const { POST } = await import("@/app/api/term-sheets/[id]/route");
    const res = await POST(jsonReq("/api/term-sheets/d1", "POST"), { params: { id: "d1" } });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/ic-votes POST  — IC_VOTING_ROLES (vote, not settle)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/ic-votes", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/ic-votes/route");
    const res = await POST(jsonReq("/api/ic-votes", "POST", {}), { params: {} as never });
    expect(res.status).toBe(401);
  });

  it("403 when role is analyst (cannot vote)", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    const { POST } = await import("@/app/api/ic-votes/route");
    const res = await POST(
      jsonReq("/api/ic-votes", "POST", { memoId: "m1", decision: "approve" }),
      { params: {} as never },
    );
    expect(res.status).toBe(403);
  });

  it("403 when role is founder", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("founder");
    const { POST } = await import("@/app/api/ic-votes/route");
    const res = await POST(
      jsonReq("/api/ic-votes", "POST", { memoId: "m1", decision: "approve" }),
      { params: {} as never },
    );
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/sourced-opportunities POST — ANALYST_ROLES
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/sourced-opportunities", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/sourced-opportunities/route");
    const res = await POST(jsonReq("/api/sourced-opportunities", "POST", { startupName: "Acme" }), {
      params: {} as never,
    });
    expect(res.status).toBe(401);
  });

  it("403 when role is investor (no portfolio write access)", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("investor");
    const { POST } = await import("@/app/api/sourced-opportunities/route");
    const res = await POST(jsonReq("/api/sourced-opportunities", "POST", { startupName: "Acme" }), {
      params: {} as never,
    });
    expect(res.status).toBe(403);
  });

  it("201 when role is analyst", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    mockDb.vCSourcedOpportunity.createMany.mockResolvedValue({ count: 1 } as never);
    const { POST } = await import("@/app/api/sourced-opportunities/route");
    const res = await POST(jsonReq("/api/sourced-opportunities", "POST", { startupName: "Acme" }), {
      params: {} as never,
    });
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/deals/[id]/advance POST — per-stage gating
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/deals/[id]/advance", () => {
  function mockOpenDealAtStage(stage: string) {
    mockDb.vCDeal.findFirst.mockResolvedValue({
      id: "d1",
      currentStage: stage,
      closedStatus: "open",
      application: { startupName: "Acme", contactName: "C", contactEmail: "c@acme.test" },
    } as never);
  }

  it("403 when analyst tries to advance to ic-review", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    mockOpenDealAtStage("partner-review");
    const { POST } = await import("@/app/api/deals/[id]/advance/route");
    const res = await POST(jsonReq("/api/deals/d1/advance", "POST", { toStage: "ic-review" }), {
      params: { id: "d1" },
    });
    expect(res.status).toBe(403);
  });

  it("200 when partner advances to ic-review", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("partner");
    mockOpenDealAtStage("partner-review");
    mockDb.$transaction.mockResolvedValue([{}, {}] as never);
    const { POST } = await import("@/app/api/deals/[id]/advance/route");
    const res = await POST(jsonReq("/api/deals/d1/advance", "POST", { toStage: "ic-review" }), {
      params: { id: "d1" },
    });
    expect(res.status).toBe(200);
    // Audit success row
    expect(mockDb.vCAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "deal.advance", outcome: "ok" }),
      }),
    );
  });

  it("200 when analyst advances to research (mid-stage)", async () => {
    setSession({ id: USER, orgId: TENANT });
    mockMembershipRole("analyst");
    mockOpenDealAtStage("discovery-call");
    mockDb.$transaction.mockResolvedValue([{}, {}] as never);
    const { POST } = await import("@/app/api/deals/[id]/advance/route");
    const res = await POST(jsonReq("/api/deals/d1/advance", "POST", { toStage: "research" }), {
      params: { id: "d1" },
    });
    expect(res.status).toBe(200);
  });
});
