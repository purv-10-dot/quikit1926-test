import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/approvals/[id]/history/route";

const db = mockDb as any;
const INST = "ai-1";

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/approvals/${INST}/history`, {
    method: "GET",
  });
}
const params = { params: { id: INST } };

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnApprovalHistory.findMany.mockResolvedValue([]);
  // Name resolution goes through central auth.user.findMany.
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/approvals/[id]/history  (no auth gate — pure read of the trail)
// ═══════════════════════════════════════════════

describe("GET /api/approvals/[id]/history", () => {
  it("returns an empty trail when there is no history", async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns the history rows for the instance, scoped by instanceId", async () => {
    setContext(makeAdminCtx());
    db.cnApprovalHistory.findMany.mockResolvedValue([
      {
        id: "h1",
        instanceId: INST,
        stepOrder: 1,
        action: "approve",
        actionById: "u-1",
        actionAt: new Date("2026-01-01T10:00:00Z"),
        comments: null,
      },
      {
        id: "h2",
        instanceId: INST,
        stepOrder: 2,
        action: "reject",
        actionById: "u-2",
        actionAt: new Date("2026-01-02T10:00:00Z"),
        comments: "no budget",
      },
    ]);
    db.user.findMany.mockResolvedValue([
      { id: "u-1", email: "a@x.io", firstName: "Asha", lastName: "Rao" },
    ]);

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // instanceId is the where filter
    expect(db.cnApprovalHistory.findMany.mock.calls[0][0].where.instanceId).toBe(INST);
    // resolved name where the central user exists; raw id fallback otherwise
    expect(body.data[0].actionByName).toBe("Asha Rao");
    expect(body.data[1].actionByName).toBe("u-2");
    expect(body.data[1].comments).toBe("no budget");
    expect(body.data[1].action).toBe("reject");
  });
});
