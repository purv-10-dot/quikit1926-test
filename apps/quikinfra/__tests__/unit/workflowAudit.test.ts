import { describe, it, expect, vi } from "vitest";
import {
  recordAudit,
  recordApprovalAction,
  ApprovalActionError,
} from "@/lib/workflow/audit";
import type { TenantContext } from "@/lib/auth/context";

// recordAudit / recordApprovalAction take the `tx` client as a parameter, so
// no module mock is needed — we pass a hand-rolled fake tx and assert the row.
function fakeTx() {
  return {
    cnAuditLog: { create: vi.fn().mockResolvedValue({}) },
    cnApprovalHistory: { create: vi.fn().mockResolvedValue({}) },
  };
}

const ctx = {
  userId: "user-1",
  orgId: "org-1",
  userEmail: "u@x.com",
  userName: "User One",
} as unknown as TenantContext;

describe("recordAudit", () => {
  it("writes a CnAuditLog row with the ctx + entry fields", async () => {
    const tx = fakeTx();
    await recordAudit(tx as any, ctx, {
      entityType: "po",
      entityId: "po-1",
      action: "approve",
      changes: { fromStatus: "draft", toStatus: "approved" },
      ipAddress: "1.2.3.4",
    });
    expect(tx.cnAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.cnAuditLog.create).toHaveBeenCalledWith({
      data: {
        orgId: "org-1",
        entityType: "po",
        entityId: "po-1",
        action: "approve",
        userId: "user-1",
        changes: { fromStatus: "draft", toStatus: "approved" },
        ipAddress: "1.2.3.4",
      },
    });
  });

  it("defaults changes → undefined and ipAddress → null when omitted", async () => {
    const tx = fakeTx();
    await recordAudit(tx as any, ctx, {
      entityType: "rfq",
      entityId: "rfq-9",
      action: "create",
    });
    const data = tx.cnAuditLog.create.mock.calls[0][0].data;
    expect(data.changes).toBeUndefined();
    expect(data.ipAddress).toBeNull();
  });
});

describe("recordApprovalAction", () => {
  it("writes a CnApprovalHistory row for an approve action", async () => {
    const tx = fakeTx();
    await recordApprovalAction(tx as any, ctx, {
      instanceId: "inst-1",
      stepOrder: 2,
      action: "approve",
    });
    expect(tx.cnApprovalHistory.create).toHaveBeenCalledWith({
      data: {
        instanceId: "inst-1",
        stepOrder: 2,
        action: "approve",
        actionById: "user-1",
        comments: null,
      },
    });
  });

  it("persists the comment when supplied", async () => {
    const tx = fakeTx();
    await recordApprovalAction(tx as any, ctx, {
      instanceId: "inst-1",
      stepOrder: 1,
      action: "reject",
      comments: "missing docs",
    });
    expect(tx.cnApprovalHistory.create.mock.calls[0][0].data.comments).toBe("missing docs");
  });

  it("throws ApprovalActionError(COMMENT_REQUIRED) for reject/return without a comment", async () => {
    const tx = fakeTx();
    for (const action of ["reject", "return"] as const) {
      await expect(
        recordApprovalAction(tx as any, ctx, { instanceId: "i", stepOrder: 1, action }),
      ).rejects.toThrowError(ApprovalActionError);
    }
    // whitespace-only comment is also rejected
    await expect(
      recordApprovalAction(tx as any, ctx, {
        instanceId: "i",
        stepOrder: 1,
        action: "return",
        comments: "   ",
      }),
    ).rejects.toMatchObject({ code: "COMMENT_REQUIRED", httpStatus: 400 });
    expect(tx.cnApprovalHistory.create).not.toHaveBeenCalled();
  });

  it("does NOT require a comment for approve / reverse", async () => {
    const tx = fakeTx();
    await expect(
      recordApprovalAction(tx as any, ctx, { instanceId: "i", stepOrder: 1, action: "reverse" }),
    ).resolves.toBeUndefined();
    expect(tx.cnApprovalHistory.create).toHaveBeenCalledTimes(1);
  });
});

describe("ApprovalActionError", () => {
  it("carries code, default httpStatus 400, and the right name", () => {
    const e = new ApprovalActionError("X_CODE", "boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("X_CODE");
    expect(e.httpStatus).toBe(400);
    expect(e.name).toBe("ApprovalActionError");
    expect(e.message).toBe("boom");
  });
});
