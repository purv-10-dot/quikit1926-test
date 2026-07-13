import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Exercises the canonical `withHelpdeskAuth` (→ withOrgAuth) guard through the
 * tickets list route:
 *   - unauthenticated  → 401
 *   - authenticated    → query is scoped to the caller's resolved orgId
 *     (tenant isolation), never a client-supplied value.
 */

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => getServerSession() }));

const getOrgId = vi.fn();
vi.mock("@/lib/api/getOrgId", () => ({ getOrgId: () => getOrgId() }));

const resolveUser = vi.fn();
vi.mock("@/lib/helpdesk-context", () => ({
  resolveUser: (...a: unknown[]) => resolveUser(...a),
  resolveDefaultAppId: vi.fn().mockResolvedValue("app1"),
}));

const db = {
  ticket: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock("@/lib/db", () => ({ prisma: db, db }));

import { GET } from "@/app/api/tickets/route";

function req(url = "http://localhost/api/tickets") {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}
const routeCtx = { params: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.ticket.findMany.mockResolvedValue([]);
  db.ticket.count.mockResolvedValue(0);
});

describe("GET /api/tickets — auth guard", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(req(), routeCtx);
    expect(res.status).toBe(401);
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the resolved orgId (tenant isolation)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA", membershipRole: "member" } });
    getOrgId.mockResolvedValue("orgA");
    resolveUser.mockResolvedValue({ id: "hdUser1", role: "HELPDESK_ADMIN" });

    const res = await GET(req(), routeCtx);
    expect(res.status).toBe(200);

    expect(resolveUser).toHaveBeenCalledWith("orgA", "u1");
    const whereArg = db.ticket.findMany.mock.calls[0][0].where;
    expect(whereArg.tenant_id).toBe("orgA");
    // Non-customer role must NOT be constrained to own tickets.
    expect(whereArg.requester_id).toBeUndefined();
  });

  it("customers are restricted to their own tickets", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u2", orgId: "orgB", membershipRole: "member" } });
    getOrgId.mockResolvedValue("orgB");
    resolveUser.mockResolvedValue({ id: "hdCustomer", role: "CUSTOMER" });

    await GET(req(), routeCtx);
    const whereArg = db.ticket.findMany.mock.calls[0][0].where;
    expect(whereArg.tenant_id).toBe("orgB");
    expect(whereArg.requester_id).toBe("hdCustomer");
  });
});
