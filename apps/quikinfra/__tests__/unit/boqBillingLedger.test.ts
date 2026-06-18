import { describe, it, expect, vi } from "vitest";
import { postBillingEntry, BillingLedgerError } from "@/lib/boq/billing-ledger";

// The ledger takes `tx: any` directly and only touches recordAudit (which also
// uses only `tx`). So we build a fake tx with vi.fn() table accessors — no DB
// mock needed. Decimal columns are reproduced as objects exposing .toString().

const ctx: any = { orgId: "org-1", userId: "user-1" };

function dec(n: number) {
  return { toString: () => String(n) };
}

interface FakeItem {
  id?: string;
  isGroup?: boolean;
  billedQty?: number;
  subDoneQty?: number;
  selfDoneQty?: number;
  category?: string;
}

function makeTx(item: FakeItem | null) {
  const fakeItem =
    item === null
      ? null
      : {
          id: item.id ?? "boq-item-1",
          isGroup: item.isGroup ?? false,
          category: item.category ?? "civil",
          billedQty: dec(item.billedQty ?? 0),
          subDoneQty: dec(item.subDoneQty ?? 0),
          selfDoneQty: dec(item.selfDoneQty ?? 0),
        };

  return {
    cnBOQItemV2: {
      findFirst: vi.fn().mockResolvedValue(fakeItem),
      update: vi.fn().mockResolvedValue({}),
    },
    cnBOQBillingLedger: {
      create: vi.fn().mockResolvedValue({ id: "ledger-1" }),
    },
    cnAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function posting(over: Partial<any> = {}) {
  return {
    projectId: "proj-1",
    boqNo: "A.1.1",
    qty: 10,
    direction: 1 as const,
    ...over,
  };
}

describe("postBillingEntry — validation guards", () => {
  it("rejects non-positive qty", async () => {
    const tx = makeTx({ billedQty: 0, subDoneQty: 100, selfDoneQty: 0 });
    await expect(postBillingEntry(tx as any, ctx, posting({ qty: 0 }))).rejects.toMatchObject({
      code: "INVALID_QTY",
    });
    expect(tx.cnBOQItemV2.findFirst).not.toHaveBeenCalled();
  });

  it("throws BOQ_NOT_FOUND (404) when the item is missing", async () => {
    const tx = makeTx(null);
    await expect(postBillingEntry(tx as any, ctx, posting())).rejects.toMatchObject({
      code: "BOQ_NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("rejects billing a group row", async () => {
    const tx = makeTx({ isGroup: true });
    await expect(postBillingEntry(tx as any, ctx, posting())).rejects.toMatchObject({
      code: "GROUP_NOT_ALLOWED",
    });
  });

  it("scopes the lookup to tenant + project + boqNo + not-deleted", async () => {
    const tx = makeTx({ subDoneQty: 100 });
    await postBillingEntry(tx as any, ctx, posting({ qty: 5 }));
    expect(tx.cnBOQItemV2.findFirst).toHaveBeenCalledWith({
      where: { orgId: "org-1", projectId: "proj-1", boqNo: "A.1.1", deletedAt: null },
    });
  });
});

describe("postBillingEntry — over-done guard", () => {
  it("rejects EXCEEDS_DONE when cumulative billed would exceed done qty", async () => {
    // done = 50 + 0; already billed 40; +20 => 60 > 50
    const tx = makeTx({ billedQty: 40, subDoneQty: 50, selfDoneQty: 0 });
    await expect(postBillingEntry(tx as any, ctx, posting({ qty: 20 }))).rejects.toMatchObject({
      code: "EXCEEDS_DONE",
    });
    expect(tx.cnBOQBillingLedger.create).not.toHaveBeenCalled();
  });

  it("allows billing exactly up to the done qty", async () => {
    const tx = makeTx({ billedQty: 40, subDoneQty: 50, selfDoneQty: 0 });
    const res = await postBillingEntry(tx as any, ctx, posting({ qty: 10 }));
    expect(res.cumulativeBilledQty).toBe(50);
    expect(res.ledgerId).toBe("ledger-1");
  });

  it("bypasses the over-done guard with overrideFlag", async () => {
    const tx = makeTx({ billedQty: 40, subDoneQty: 50, selfDoneQty: 0 });
    const res = await postBillingEntry(
      tx as any,
      ctx,
      posting({ qty: 100, overrideFlag: true, overrideReason: "approved exception" }),
    );
    expect(res.cumulativeBilledQty).toBe(140);
    expect(tx.cnBOQBillingLedger.create).toHaveBeenCalled();
  });

  it("counts both sub + self toward cumulative done", async () => {
    // done = 30 + 30 = 60; bill 60 ok
    const tx = makeTx({ billedQty: 0, subDoneQty: 30, selfDoneQty: 30 });
    const res = await postBillingEntry(tx as any, ctx, posting({ qty: 60 }));
    expect(res.cumulativeBilledQty).toBe(60);
  });
});

describe("postBillingEntry — reversal", () => {
  it("rejects a reversal that would drive cumulative below zero", async () => {
    const tx = makeTx({ billedQty: 5, subDoneQty: 100 });
    await expect(
      postBillingEntry(tx as any, ctx, posting({ qty: 10, direction: -1 })),
    ).rejects.toMatchObject({ code: "REVERSAL_UNDERFLOW" });
  });

  it("applies a valid reversal (direction -1) without the over-done guard", async () => {
    const tx = makeTx({ billedQty: 30, subDoneQty: 10 });
    const res = await postBillingEntry(tx as any, ctx, posting({ qty: 10, direction: -1 }));
    expect(res.cumulativeBilledQty).toBe(20);
    expect(tx.cnBOQBillingLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: -1, qty: 10 }) }),
    );
  });
});

describe("postBillingEntry — persistence side effects", () => {
  it("writes ledger row, updates the cached billedQty, and records audit", async () => {
    const tx = makeTx({ billedQty: 0, subDoneQty: 100 });
    await postBillingEntry(tx as any, ctx, posting({ qty: 25, rabId: "rab-9" }));

    expect(tx.cnBOQBillingLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org-1",
          projectId: "proj-1",
          boqNo: "A.1.1",
          qty: 25,
          direction: 1,
          rabId: "rab-9",
          createdBy: "user-1",
        }),
      }),
    );
    expect(tx.cnBOQItemV2.update).toHaveBeenCalledWith({
      where: { id: "boq-item-1" },
      data: { billedQty: 25, updatedBy: "user-1" },
    });
    expect(tx.cnAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "rab_billing_applied", entityType: "boq_item" }),
      }),
    );
  });

  it("records the reversal audit action on direction -1", async () => {
    const tx = makeTx({ billedQty: 30, subDoneQty: 100 });
    await postBillingEntry(tx as any, ctx, posting({ qty: 5, direction: -1 }));
    expect(tx.cnAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "rab_billing_reversed" }),
      }),
    );
  });
});

describe("BillingLedgerError", () => {
  it("carries code + httpStatus (default 400)", () => {
    const e = new BillingLedgerError("X", "msg");
    expect(e.code).toBe("X");
    expect(e.httpStatus).toBe(400);
    expect(e.name).toBe("BillingLedgerError");
    expect(e).toBeInstanceOf(Error);
  });
});
