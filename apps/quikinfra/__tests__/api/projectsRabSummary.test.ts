import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { GET } from "@/app/api/projects/[projectId]/rab/summary/route";

const db = mockDb as any;
const PROJECT_ID = "proj1";
const params = { params: { projectId: PROJECT_ID } };

function req(): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/rab/summary`, {
    method: "GET",
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/projects/[projectId]/rab/summary  (gate construction.rab.view, project-scoped)
// ═══════════════════════════════════════════════

describe("GET /api/projects/[projectId]/rab/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req(), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req(), params)).status).toBe(403);
  });

  it("returns 403 when the project is outside the user's assigned scope", async () => {
    setContext(makeUserCtx(["construction.rab.view"], { projectIds: ["other-proj"] }));
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not accessible/i);
  });

  it("returns the per-project summary scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.groupBy.mockResolvedValue([
      { status: "draft", _count: { _all: 2 } },
      { status: "approved", _count: { _all: 1 } },
    ]);
    db.cnRunningAccountBill.aggregate
      .mockResolvedValueOnce({
        _sum: {
          currentBillAmount: "1000",
          netPayable: "900",
          retentionAmount: "100",
        },
        _count: { _all: 1 },
      }) // approvedAgg
      .mockResolvedValueOnce({ _count: { _all: 3 } }); // allAgg

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.projectId).toBe(PROJECT_ID);
    expect(body.data.totalBills).toBe(3);
    expect(body.data.approvedBills).toBe(1);
    expect(body.data.billedToDate).toBe("1000.00");
    expect(body.data.statusCounts.draft).toBe(2);

    const where = db.cnRunningAccountBill.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({ orgId: TEST_TENANT, projectId: PROJECT_ID });
  });
});
