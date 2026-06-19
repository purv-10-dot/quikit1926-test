import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { NextRequest, NextResponse } from "next/server";

const db = mockDb as any;

// ─── Mock the route-coupled collaborators ───────────────────────────────
// requirePermission → returns a TenantContext (or a NextResponse to short-
// circuit). rateLimit → never blocks. recordAudit → no-op spy.
const ctx = {
  userId: "user-1",
  orgId: "org-1",
  userName: "User One",
  userEmail: "u@x.com",
};

vi.mock("@/lib/auth/context", () => ({
  requirePermission: vi.fn(async () => ctx),
}));

vi.mock("@/lib/workflow/rate-limit", () => ({
  LIMITS: { APPROVAL: { bucket: "approve", limit: 30, windowMs: 60000 } },
  rateLimit: vi.fn(async () => ({ blocked: false })),
}));

const recordAuditSpy = vi.fn(async () => {});
vi.mock("@/lib/workflow/audit", () => ({
  recordAudit: (...args: unknown[]) => (recordAuditSpy as any)(...args),
}));

// envelope.ok/err call next/headers which throws outside a request — guard it.
vi.mock("next/headers", () => ({ headers: () => new Headers() }));

import { handleApprovalAction } from "@/lib/workflow/handle-approval";
import { requirePermission } from "@/lib/auth/context";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/po/po-1/approve", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  } as any);
}

const baseOpts = {
  prismaModel: "cnPurchaseOrder",
  entityId: "po-1",
  entityType: "po",
  requiredPermission: "construction.po.approve",
  transitions: {
    approve: ["pending_approval", "submitted"],
    reject: ["pending_approval", "submitted"],
    return: ["pending_approval", "submitted"],
  },
};

beforeEach(() => {
  resetMockDb();
  recordAuditSpy.mockClear();
  (requirePermission as any).mockResolvedValue(ctx);
  // $transaction runs the callback with a tx that proxies to mockDb models.
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

function stubEntity(status: string) {
  db.cnPurchaseOrder.findFirst.mockResolvedValue({ id: "po-1", status, orgId: "org-1" });
  db.cnPurchaseOrder.update.mockImplementation(async (args: any) => ({
    id: "po-1",
    status: args.data.status,
  }));
  db.cnAuditLog.create.mockResolvedValue({});
}

describe("handleApprovalAction — happy paths", () => {
  it("approve: submitted → approved, writes audit, returns ok envelope", async () => {
    stubEntity("submitted");
    const res = await handleApprovalAction(makeReq({ action: "approve" }), baseOpts);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      id: "po-1",
      entityType: "po",
      action: "approve",
      fromStatus: "submitted",
      toStatus: "approved",
    });
    expect(db.cnPurchaseOrder.update.mock.calls[0][0].data.status).toBe("approved");
    expect(recordAuditSpy).toHaveBeenCalledTimes(1);
  });

  it("reject: requires a comment → rejected status", async () => {
    stubEntity("pending_approval");
    const res = await handleApprovalAction(
      makeReq({ action: "reject", comments: "bad pricing" }),
      baseOpts,
    );
    const json = await res.json();
    expect(json.data.toStatus).toBe("rejected");
    expect(db.cnPurchaseOrder.update.mock.calls[0][0].data.status).toBe("rejected");
  });

  it("return: → returned status", async () => {
    stubEntity("submitted");
    const res = await handleApprovalAction(
      makeReq({ action: "return", comments: "fix qty" }),
      baseOpts,
    );
    expect((await res.json()).data.toStatus).toBe("returned");
  });

  it("defaults to approve when no action is supplied", async () => {
    stubEntity("submitted");
    const res = await handleApprovalAction(makeReq({}), baseOpts);
    expect((await res.json()).data.action).toBe("approve");
  });

  it("runs onApproved inside the transaction before the status flip", async () => {
    stubEntity("submitted");
    const onApproved = vi.fn(async () => {});
    await handleApprovalAction(makeReq({ action: "approve" }), { ...baseOpts, onApproved });
    expect(onApproved).toHaveBeenCalledTimes(1);
  });
});

describe("handleApprovalAction — validation + illegal state", () => {
  it("401/403 short-circuit: returns the NextResponse from requirePermission", async () => {
    const denied = NextResponse.json({ ok: false }, { status: 403 });
    (requirePermission as any).mockResolvedValue(denied);
    const res = await handleApprovalAction(makeReq({ action: "approve" }), baseOpts);
    expect(res.status).toBe(403);
  });

  it("INVALID_ACTION for an unknown action", async () => {
    const res = await handleApprovalAction(makeReq({ action: "frobnicate" }), baseOpts);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ACTION");
  });

  it("COMMENT_REQUIRED when rejecting without a comment", async () => {
    const res = await handleApprovalAction(makeReq({ action: "reject" }), baseOpts);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("COMMENT_REQUIRED");
  });

  it("404 when the entity is not found (tenant-scoped)", async () => {
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    const res = await handleApprovalAction(makeReq({ action: "approve" }), baseOpts);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("PO_NOT_FOUND");
  });

  it("APPROVAL_CONFLICT (409) when the current status forbids the action", async () => {
    stubEntity("approved"); // approve allowed only from pending_approval/submitted
    const res = await handleApprovalAction(makeReq({ action: "approve" }), baseOpts);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPROVAL_CONFLICT");
  });

  it("maps a typed domain error from onApproved to its httpStatus", async () => {
    stubEntity("submitted");
    const onApproved = vi.fn(async () => {
      throw { code: "EXCEEDS_TENDER", httpStatus: 422, message: "over budget" };
    });
    const res = await handleApprovalAction(makeReq({ action: "approve" }), { ...baseOpts, onApproved });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("EXCEEDS_TENDER");
  });

  it("unknown errors in the transaction become 500 APPROVAL_FAILED", async () => {
    stubEntity("submitted");
    db.cnPurchaseOrder.update.mockRejectedValue(new Error("db down"));
    const res = await handleApprovalAction(makeReq({ action: "approve" }), baseOpts);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("APPROVAL_FAILED");
  });
});
