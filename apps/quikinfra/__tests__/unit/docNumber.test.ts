import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  generateDocNumber,
  nextProjectScopedDocNumber,
  withDocNumberRetry,
} from "@/lib/db/doc-number";

const db = mockDb as any;

beforeEach(resetMockDb);

describe("generateDocNumber — tenant-scoped calendar-year format", () => {
  it("formats {PREFIX}-{YYYY}-{NNNNN} with 5-digit zero-padding (count+1)", async () => {
    db.cnRunningAccountBill.count.mockResolvedValue(0);
    const year = new Date().getFullYear();
    const n = await generateDocNumber("rab", "org-1");
    expect(n).toBe(`RAB-${year}-00001`);
  });

  it("increments off the existing count", async () => {
    db.cnRunningAccountBill.count.mockResolvedValue(41);
    const year = new Date().getFullYear();
    expect(await generateDocNumber("rab", "org-1")).toBe(`RAB-${year}-00042`);
  });

  it("scopes the count to org + the prefix startsWith filter", async () => {
    db.cnRunningAccountBill.count.mockResolvedValue(0);
    const year = new Date().getFullYear();
    await generateDocNumber("rab", "org-99");
    expect(db.cnRunningAccountBill.count).toHaveBeenCalledWith({
      where: { orgId: "org-99", rabNumber: { startsWith: `RAB-${year}-` } },
    });
  });

  it("uses the right model + prefix per doc type", async () => {
    db.cnStockReconciliation.count.mockResolvedValue(0);
    const year = new Date().getFullYear();
    expect(await generateDocNumber("reconciliation", "org-1")).toBe(`REC-${year}-00001`);
  });

  it("pads counts above 99999 without truncating", async () => {
    db.cnRunningAccountBill.count.mockResolvedValue(99999);
    const year = new Date().getFullYear();
    expect(await generateDocNumber("rab", "org-1")).toBe(`RAB-${year}-100000`);
  });

  it("throws on an unknown doc type", async () => {
    await expect(generateDocNumber("nope" as any, "org-1")).rejects.toThrow("Unknown doc type");
  });
});

describe("nextProjectScopedDocNumber — {PREFIX}-{CODE}-{FY}-{NNNN}", () => {
  it("returns 0001 when no existing rows match", async () => {
    db.cnPurchaseOrder.findMany.mockResolvedValue([]);
    const n = await nextProjectScopedDocNumber({
      type: "po",
      orgId: "org-1",
      projectCode: "PROJ",
    });
    expect(n).toBe("PO-PROJ-26-0001");
  });

  it("finds the highest trailing suffix and returns +1 (4-digit pad)", async () => {
    db.cnPurchaseOrder.findMany.mockResolvedValue([
      { poNumber: "PO-PROJ-26-0001" },
      { poNumber: "PO-PROJ-26-0007" },
      { poNumber: "PO-PROJ-26-0003" },
    ]);
    const n = await nextProjectScopedDocNumber({
      type: "po",
      orgId: "org-1",
      projectCode: "PROJ",
    });
    expect(n).toBe("PO-PROJ-26-0008");
  });

  it("honours a custom FY and scopes the scan by prefix startsWith", async () => {
    db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
    const n = await nextProjectScopedDocNumber({
      type: "pr",
      orgId: "org-7",
      projectCode: "ABC",
      fy: "27",
    });
    expect(n).toBe("PR-ABC-27-0001");
    expect(db.cnPurchaseRequisition.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-7", prNumber: { startsWith: "PR-ABC-27-" } },
      select: { prNumber: true },
    });
  });

  it("pads suffixes beyond 9999 without truncating", async () => {
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([{ grnNumber: "GRN-P-26-9999" }]);
    const n = await nextProjectScopedDocNumber({
      type: "grn",
      orgId: "org-1",
      projectCode: "P",
    });
    expect(n).toBe("GRN-P-26-10000");
  });

  it("throws on an unknown project-scoped type", async () => {
    await expect(
      nextProjectScopedDocNumber({ type: "xyz" as any, orgId: "o", projectCode: "P" }),
    ).rejects.toThrow("Unknown project-scoped doc type");
  });
});

describe("withDocNumberRetry", () => {
  it("returns the task result on first success", async () => {
    let calls = 0;
    const res = await withDocNumberRetry(
      async () => "PO-P-26-0001",
      async (n) => {
        calls++;
        return `done:${n}`;
      },
      "poNumber",
    );
    expect(res).toBe("done:PO-P-26-0001");
    expect(calls).toBe(1);
  });

  it("retries on a P2002 conflict targeting the field, then succeeds", async () => {
    let attempt = 0;
    const res = await withDocNumberRetry(
      async () => `PO-P-26-000${attempt + 1}`,
      async (n) => {
        attempt++;
        if (attempt < 3) {
          const err: any = new Error("conflict");
          err.code = "P2002";
          err.meta = { target: ["poNumber"] };
          throw err;
        }
        return n;
      },
      "poNumber",
    );
    expect(res).toBe("PO-P-26-0003");
    expect(attempt).toBe(3);
  });

  it("rethrows a non-conflict error immediately", async () => {
    let attempt = 0;
    await expect(
      withDocNumberRetry(
        async () => "PO-P-26-0001",
        async () => {
          attempt++;
          throw new Error("db down");
        },
        "poNumber",
      ),
    ).rejects.toThrow("db down");
    expect(attempt).toBe(1);
  });

  it("rethrows a P2002 that targets a different field", async () => {
    await expect(
      withDocNumberRetry(
        async () => "PO-P-26-0001",
        async () => {
          const err: any = new Error("conflict");
          err.code = "P2002";
          err.meta = { target: ["someOtherUnique"] };
          throw err;
        },
        "poNumber",
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("gives up after maxAttempts conflicts and throws the last error", async () => {
    let attempt = 0;
    await expect(
      withDocNumberRetry(
        async () => "PO-P-26-0001",
        async () => {
          attempt++;
          const err: any = new Error("conflict");
          err.code = "P2002";
          err.meta = { target: ["poNumber"] };
          throw err;
        },
        "poNumber",
        3,
      ),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(attempt).toBe(3);
  });
});
