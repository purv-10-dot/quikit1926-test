import { describe, it, expect, vi } from "vitest";
import { postProgressEntry, ProgressLedgerError } from "@/lib/boq/progress-ledger";

const ctx: any = { orgId: "org-1", userId: "user-1" };

function dec(n: number) {
  return { toString: () => String(n) };
}

interface FakeItem {
  id?: string;
  isGroup?: boolean;
  subDoneQty?: number;
  selfDoneQty?: number;
  tenderQty?: number | null;
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
          subDoneQty: dec(item.subDoneQty ?? 0),
          selfDoneQty: dec(item.selfDoneQty ?? 0),
          tenderQty: item.tenderQty === null ? null : dec(item.tenderQty ?? 0),
        };

  return {
    cnBOQItemV2: {
      findFirst: vi.fn().mockResolvedValue(fakeItem),
      update: vi.fn().mockResolvedValue({}),
    },
    cnBOQProgressLedger: {
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
    workType: "sub_contractor" as const,
    direction: 1 as const,
    ...over,
  };
}

describe("postProgressEntry — validation guards", () => {
  it("rejects non-positive qty before any DB access", async () => {
    const tx = makeTx({ tenderQty: 1000 });
    await expect(postProgressEntry(tx as any, ctx, posting({ qty: -1 }))).rejects.toMatchObject({
      code: "INVALID_QTY",
    });
    expect(tx.cnBOQItemV2.findFirst).not.toHaveBeenCalled();
  });

  it("throws BOQ_NOT_FOUND (404) when missing", async () => {
    const tx = makeTx(null);
    await expect(postProgressEntry(tx as any, ctx, posting())).rejects.toMatchObject({
      code: "BOQ_NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("rejects posting to a group row", async () => {
    const tx = makeTx({ isGroup: true });
    await expect(postProgressEntry(tx as any, ctx, posting())).rejects.toMatchObject({
      code: "GROUP_NOT_ALLOWED",
    });
  });
});

describe("postProgressEntry — over-tender guard", () => {
  it("rejects EXCEEDS_TENDER when newDone would exceed tenderQty", async () => {
    const tx = makeTx({ subDoneQty: 90, selfDoneQty: 0, tenderQty: 100 });
    await expect(postProgressEntry(tx as any, ctx, posting({ qty: 20 }))).rejects.toMatchObject({
      code: "EXCEEDS_TENDER",
    });
    expect(tx.cnBOQProgressLedger.create).not.toHaveBeenCalled();
  });

  it("allows progress exactly up to tenderQty", async () => {
    const tx = makeTx({ subDoneQty: 90, selfDoneQty: 0, tenderQty: 100 });
    const res = await postProgressEntry(tx as any, ctx, posting({ qty: 10 }));
    expect(res.cumulativeDoneQty).toBe(100);
  });

  it("bypasses the over-tender guard with overrideFlag", async () => {
    const tx = makeTx({ subDoneQty: 90, selfDoneQty: 0, tenderQty: 100 });
    const res = await postProgressEntry(
      tx as any,
      ctx,
      posting({ qty: 50, overrideFlag: true, overrideReason: "scope increase" }),
    );
    expect(res.cumulativeDoneQty).toBe(140);
  });

  it("skips the guard entirely when tenderQty is 0 / null", async () => {
    const tx = makeTx({ subDoneQty: 0, selfDoneQty: 0, tenderQty: null });
    const res = await postProgressEntry(tx as any, ctx, posting({ qty: 99999 }));
    expect(res.cumulativeDoneQty).toBe(99999);
  });
});

describe("postProgressEntry — workType routing", () => {
  it("adds to subDoneQty for sub_contractor and leaves self untouched", async () => {
    const tx = makeTx({ subDoneQty: 10, selfDoneQty: 5, tenderQty: 1000 });
    await postProgressEntry(tx as any, ctx, posting({ qty: 15, workType: "sub_contractor" }));
    expect(tx.cnBOQItemV2.update).toHaveBeenCalledWith({
      where: { id: "boq-item-1" },
      data: { subDoneQty: 25, selfDoneQty: 5, updatedBy: "user-1" },
    });
  });

  it("adds to selfDoneQty for self work", async () => {
    const tx = makeTx({ subDoneQty: 10, selfDoneQty: 5, tenderQty: 1000 });
    const res = await postProgressEntry(tx as any, ctx, posting({ qty: 20, workType: "self" }));
    expect(res.cumulativeDoneQty).toBe(35); // 10 + (5+20)
    expect(tx.cnBOQItemV2.update).toHaveBeenCalledWith({
      where: { id: "boq-item-1" },
      data: { subDoneQty: 10, selfDoneQty: 25, updatedBy: "user-1" },
    });
  });
});

describe("postProgressEntry — reversal", () => {
  it("rejects a reversal that drives a column negative", async () => {
    const tx = makeTx({ subDoneQty: 5, selfDoneQty: 0, tenderQty: 1000 });
    await expect(
      postProgressEntry(tx as any, ctx, posting({ qty: 10, direction: -1, workType: "sub_contractor" })),
    ).rejects.toMatchObject({ code: "REVERSAL_UNDERFLOW" });
  });

  it("applies a valid reversal and skips the over-tender guard", async () => {
    const tx = makeTx({ subDoneQty: 50, selfDoneQty: 0, tenderQty: 10 });
    const res = await postProgressEntry(
      tx as any,
      ctx,
      posting({ qty: 20, direction: -1, workType: "sub_contractor" }),
    );
    expect(res.cumulativeDoneQty).toBe(30);
  });
});

describe("postProgressEntry — persistence side effects", () => {
  it("writes ledger + aggregate + applied audit action", async () => {
    const tx = makeTx({ subDoneQty: 0, selfDoneQty: 0, tenderQty: 1000 });
    await postProgressEntry(tx as any, ctx, posting({ qty: 12, dprId: "dpr-7" }));

    expect(tx.cnBOQProgressLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org-1",
          projectId: "proj-1",
          boqNo: "A.1.1",
          qty: 12,
          direction: 1,
          workType: "sub_contractor",
          dprId: "dpr-7",
          createdBy: "user-1",
        }),
      }),
    );
    expect(tx.cnAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "dpr_progress_applied" }),
      }),
    );
  });

  it("records the reversal audit action on direction -1", async () => {
    const tx = makeTx({ subDoneQty: 50, selfDoneQty: 0, tenderQty: 1000 });
    await postProgressEntry(tx as any, ctx, posting({ qty: 5, direction: -1 }));
    expect(tx.cnAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "dpr_progress_reversed" }),
      }),
    );
  });
});

describe("ProgressLedgerError", () => {
  it("carries code + httpStatus (default 400)", () => {
    const e = new ProgressLedgerError("X", "msg", 422);
    expect(e.code).toBe("X");
    expect(e.httpStatus).toBe(422);
    expect(e.name).toBe("ProgressLedgerError");
  });
});
