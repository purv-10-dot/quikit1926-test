import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

async function callTransition(id: string, body: object) {
  const { POST } = await import("@/app/api/opportunities/[id]/transition/route");
  const req = new Request(`http://test/api/opportunities/${id}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/opportunities/[id]/transition", () => {
  beforeEach(() => {
    db.crmOpportunity.findFirst.mockReset();
    db.crmOpportunity.update.mockReset();
    db.crmOpportunityStageTransition.create.mockReset();
    db.crmActivity.create.mockReset();
    db.crmUserPermissionTemplate.findMany.mockReset();
    db.$transaction.mockReset();
    setSession(null);
  });

  it("returns 401 unauthenticated", async () => {
    const res = await callTransition("opp1", { toStage: "Qualification" });
    expect(res.status).toBe(401);
  });

  it("returns 404 cross-tenant (opp not found in user's tenant)", async () => {
    setSession({ userId: "u1", tenantId: "t-A", role: "admin", email: "a@b.co", name: "A" });
    db.crmUserPermissionTemplate.findMany.mockResolvedValue([]);
    db.crmOpportunity.findFirst.mockResolvedValue(null);
    const res = await callTransition("opp-from-t-B", { toStage: "Qualification" });
    expect(res.status).toBe(404);
  });

  it("rejects closing without a closeReasonCategory (still enforced after full-relax)", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "user", email: "a@b.co", name: "A" });
    db.crmUserPermissionTemplate.findMany.mockResolvedValue([]);
    db.crmOpportunity.findFirst.mockResolvedValue({
      id: "opp1",
      accountId: "acc1",
      stage: "Negotiation",
      name: "Deal",
    } as never);
    const res = await callTransition("opp1", { toStage: "ClosedWon" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/closeReasonCategory is required/i);
  });

  it("happy path: Negotiation → ClosedWon writes audit + activity rows", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "admin", email: "a@b.co", name: "Alice" });
    db.crmUserPermissionTemplate.findMany.mockResolvedValue([]);
    db.crmOpportunity.findFirst.mockResolvedValue({
      id: "opp1",
      accountId: "acc1",
      stage: "Negotiation",
      name: "Deal",
    } as never);
    db.$transaction.mockImplementation(async (fn) => fn(db));
    db.crmOpportunity.update.mockResolvedValue({
      id: "opp1",
      stage: "ClosedWon",
      tenantId: "t1",
    } as never);

    const res = await callTransition("opp1", {
      toStage: "ClosedWon",
      closeReasonCategory: "Price",
      closeReason: "Beat the competitor",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.crmOpportunityStageTransition.create).toHaveBeenCalledTimes(1);
    expect(db.crmActivity.create).toHaveBeenCalledTimes(1);
  });
});
