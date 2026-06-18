import { describe, it, expect, vi, beforeEach } from "vitest";

// estimation-consumption.ts pulls `db` from @/lib/db (mocked via mockDb) and
// `listEstimations` from @/lib/projects/estimation-repository (mocked here).
const listEstimations = vi.fn();
vi.mock("@/lib/projects/estimation-repository", () => ({
  listEstimations: (...a: any[]) => listEstimations(...a),
}));

import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  getProjectMaterialBudget,
  validatePrLinesAgainstBudget,
  formatBreachMessage,
} from "@/lib/purchase/estimation-consumption";

const db = mockDb as any;

beforeEach(() => {
  resetMockDb();
  listEstimations.mockReset();
  // default: no live PR consumption, item-master backfill returns nothing
  db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
  db.cnItem.findMany.mockResolvedValue([]);
});

/** Approved estimation with a materials JSON array. */
function est(materials: any[], over: Partial<any> = {}) {
  return { status: "approved", boqItemId: "boq-1", boqNo: "A.1", materials, ...over };
}

describe("getProjectMaterialBudget — budget aggregation", () => {
  it("sums totalQty across approved estimations per itemId", async () => {
    listEstimations.mockResolvedValue([
      est([{ itemId: "cement", itemName: "Cement", uomCode: "bag", totalQty: 100 }]),
      est([{ itemId: "cement", totalQty: 50 }]),
    ]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemId: "cement",
      estimated: 150,
      consumed: 0,
      remaining: 150,
    });
  });

  it("ignores non-approved estimations", async () => {
    listEstimations.mockResolvedValue([
      est([{ itemId: "sand", totalQty: 100 }], { status: "draft" }),
      est([{ itemId: "sand", totalQty: 20 }], { status: "approved" }),
    ]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.estimated).toBe(20);
  });

  it("returns [] when no approved estimation surfaces any item", async () => {
    listEstimations.mockResolvedValue([]);
    expect(await getProjectMaterialBudget("org-1", "proj-1")).toEqual([]);
  });

  it("subtracts live PR consumption from estimated to get remaining", async () => {
    listEstimations.mockResolvedValue([est([{ itemId: "steel", itemName: "Steel", totalQty: 100 }])]);
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      { status: "approved", lines: [{ itemId: "steel", quantity: 30 }] },
      { status: "open", lines: [{ itemId: "steel", quantity: 10 }] },
    ]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows[0]!.consumed).toBe(40);
    expect(rows[0]!.remaining).toBe(60);
  });

  it("excludes rejected/cancelled/void PRs from consumption", async () => {
    listEstimations.mockResolvedValue([est([{ itemId: "steel", totalQty: 100 }])]);
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      { status: "rejected", lines: [{ itemId: "steel", quantity: 30 }] },
      { status: "cancelled", lines: [{ itemId: "steel", quantity: 10 }] },
      { status: "approved", lines: [{ itemId: "steel", quantity: 5 }] },
    ]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows[0]!.consumed).toBe(5);
  });

  it("clamps remaining to 0 when over-consumed (never negative)", async () => {
    listEstimations.mockResolvedValue([est([{ itemId: "steel", totalQty: 100 }])]);
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      { status: "approved", lines: [{ itemId: "steel", quantity: 150 }] },
    ]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows[0]!.consumed).toBe(150);
    expect(rows[0]!.remaining).toBe(0);
  });

  it("passes NOT filter when ignorePrId is set", async () => {
    listEstimations.mockResolvedValue([est([{ itemId: "steel", totalQty: 100 }])]);
    await getProjectMaterialBudget("org-1", "proj-1", { ignorePrId: "pr-edit" });
    expect(db.cnPurchaseRequisition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1", projectId: "proj-1", NOT: { id: "pr-edit" } }),
      }),
    );
  });

  it("backfills missing itemName/uomCode from the item master", async () => {
    listEstimations.mockResolvedValue([est([{ itemId: "i1", totalQty: 10 }])]); // no name/uom
    db.cnItem.findMany.mockResolvedValue([{ id: "i1", name: "Resolved Name", uom: { code: "kg" } }]);
    const rows = await getProjectMaterialBudget("org-1", "proj-1");
    expect(rows[0]!.itemName).toBe("Resolved Name");
    expect(rows[0]!.uomCode).toBe("kg");
  });
});

describe("validatePrLinesAgainstBudget", () => {
  function withBudget(remaining: number) {
    listEstimations.mockResolvedValue([est([{ itemId: "steel", itemName: "Steel", uomCode: "kg", totalQty: remaining }])]);
    db.cnPurchaseRequisition.findMany.mockResolvedValue([]); // consumed 0 => remaining == estimated
  }

  it("passes when requested is under remaining (under-budget)", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "steel", quantity: 80 }]);
    expect(res).toEqual({ ok: true });
  });

  it("passes at exactly the remaining (boundary, not a breach)", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "steel", quantity: 100 }]);
    expect(res.ok).toBe(true);
  });

  it("flags a breach when requested exceeds remaining (over-budget)", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "steel", quantity: 101 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.breaches).toHaveLength(1);
      expect(res.breaches[0]).toMatchObject({ itemId: "steel", requested: 101, remaining: 100, estimated: 100 });
    }
  });

  it("aggregates multiple lines of the same item before checking", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [
      { itemId: "steel", quantity: 60 },
      { itemId: "steel", quantity: 50 }, // total 110 > 100
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.breaches[0]!.requested).toBe(110);
  });

  it("allows items not covered by any budget through unconstrained", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "unbudgeted", quantity: 9999 }]);
    expect(res.ok).toBe(true);
  });

  it("short-circuits ok when no budget is configured at all", async () => {
    listEstimations.mockResolvedValue([]);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "x", quantity: 5 }]);
    expect(res).toEqual({ ok: true });
  });

  it("ignores zero / non-positive request qty", async () => {
    withBudget(100);
    const res = await validatePrLinesAgainstBudget("org-1", "proj-1", [{ itemId: "steel", quantity: 0 }]);
    expect(res.ok).toBe(true);
  });
});

describe("formatBreachMessage", () => {
  it("renders a human-readable breach summary", () => {
    const msg = formatBreachMessage([
      { itemId: "steel", itemName: "Steel", uomCode: "kg", requested: 110, remaining: 100, estimated: 100, consumed: 0 },
    ]);
    expect(msg).toContain("Steel");
    expect(msg).toContain("requested 110 kg");
    expect(msg).toContain("only 100 left");
    expect(msg).toContain("estimated 100");
    expect(msg).toContain("already consumed 0");
  });

  it("falls back to itemId when itemName is empty", () => {
    const msg = formatBreachMessage([
      { itemId: "i-9", itemName: "", uomCode: "", requested: 5, remaining: 1, estimated: 1, consumed: 0 },
    ]);
    expect(msg).toContain("i-9");
  });
});
