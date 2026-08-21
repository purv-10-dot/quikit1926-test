// POST /api/channels/[id]/approvals/reconcile — layer 2 of the drift bound.
//
// Mock-backed, like the sibling ai-reset suite: every DB-backed route test in
// this app is excluded from Vitest, so a DB-backed file here would never run.
//
// The assertions that matter are the two negative ones. This route's whole job
// is to let the reconciler conclude "this request is gone" from a request's
// ABSENCE, and absence is only evidence when the read was complete and
// successful. A failed read handed on as an empty list, or a partial page
// treated as the whole ledger, would persist "we couldn't confirm this" onto
// perfectly healthy cards and fan it out to the channel.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/errors";

const ORG = "org-1";
const ME = "u-me";
const CHANNEL = "c-1";

vi.mock("@/lib/auth-shims", async () => {
  const { HttpError: HE } = await import("@/lib/errors");
  return {
    HttpError: HE,
    assertMembership: vi.fn(async () => undefined),
    withOrgAuth:
      (
        handler: (
          req: NextRequest,
          ctx: { orgId: string; userId: string },
          params: Record<string, string>,
        ) => Promise<Response>,
      ) =>
      async (req: NextRequest, arg?: { params?: Record<string, string> }) => {
        try {
          return await handler(req, { orgId: ORG, userId: ME }, arg?.params ?? {});
        } catch (e: unknown) {
          const status = e instanceof HE ? e.status : 500;
          return Response.json({ success: false, error: (e as Error).message }, { status });
        }
      },
  };
});

const userCan = vi.fn(async () => true);
vi.mock("@/lib/authz/permissions", () => ({
  userCan: (...a: unknown[]) => userCan(...(a as [])),
}));

const listApprovalRequests = vi.fn();
vi.mock("@/lib/server/runtime", () => ({
  getRuntimeClient: () => ({ listApprovalRequests }),
}));

type ReconcileArgs = [
  ctx: { orgId: string; userId: string },
  channelId: string,
  rows: unknown[],
  opts: { ledgerComplete: boolean },
];
const reconcileChannelApprovals = vi.fn(async (..._a: ReconcileArgs) => ({
  checked: 0,
  patched: 0,
  unconfirmed: 0,
}));
vi.mock("@/lib/server/approval-message.service", () => ({
  reconcileChannelApprovals: (...a: ReconcileArgs) => reconcileChannelApprovals(...a),
}));

import { ListApprovalsError } from "@/lib/server/runtime/types";
import { POST } from "./route";

const call = (id = CHANNEL) =>
  POST(
    new Request(`http://test.local/api/channels/${id}/approvals/reconcile`, {
      method: "POST",
    }) as NextRequest,
    { params: { id } },
  );

/** The `opts` the reconciler was invoked with. */
function reconcileOpts(): { ledgerComplete: boolean } {
  return reconcileChannelApprovals.mock.calls[0]![3];
}

beforeEach(() => {
  userCan.mockReset();
  userCan.mockResolvedValue(true);
  listApprovalRequests.mockReset();
  reconcileChannelApprovals.mockReset();
  reconcileChannelApprovals.mockResolvedValue({ checked: 0, patched: 0, unconfirmed: 0 });
});

describe("POST /api/channels/[id]/approvals/reconcile", () => {
  it("403 without the assistant capability", async () => {
    userCan.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(listApprovalRequests).not.toHaveBeenCalled();
  });

  it("reads the ledger with session-derived identity, never anything from the request", async () => {
    listApprovalRequests.mockResolvedValue({ requests: [], total: 0 });
    await call();
    const input = listApprovalRequests.mock.calls[0]![0] as { orgId: string; userId: string };
    expect(input.orgId).toBe(ORG);
    expect(input.userId).toBe(ME);
  });

  it("reconciles against the page it read, and reports what moved", async () => {
    listApprovalRequests.mockResolvedValue({ requests: [{ id: "r-1" }], total: 1 });
    reconcileChannelApprovals.mockResolvedValue({ checked: 1, patched: 1, unconfirmed: 0 });

    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      checked: 1,
      patched: 1,
      unconfirmed: 0,
      ledgerComplete: true,
    });
  });

  it("⚠️ changes NOTHING when the ledger read fails", async () => {
    // Handing the reconciler an empty array here would mark every healthy
    // pending card in the channel unconfirmable — turning a transient outage
    // into a wrong state written to the database and fanned out to everyone.
    listApprovalRequests.mockRejectedValue(new ListApprovalsError("unavailable", 503));

    const res = await call();
    expect(res.status).toBe(502);
    expect(reconcileChannelApprovals).not.toHaveBeenCalled();
  });

  it("⚠️ changes nothing on a timeout either, and says so distinctly", async () => {
    listApprovalRequests.mockRejectedValue(new ListApprovalsError("timeout"));
    const res = await call();
    expect(res.status).toBe(504);
    expect(reconcileChannelApprovals).not.toHaveBeenCalled();
  });

  it("⚠️ tells the reconciler the ledger was PARTIAL when it was", async () => {
    // 100 rows returned out of 140: a live request beyond the page boundary is
    // indistinguishable from an aged-out one, so absence proves nothing.
    listApprovalRequests.mockResolvedValue({
      requests: Array.from({ length: 100 }, (_, i) => ({ id: `r-${i}` })),
      total: 140,
    });
    await call();
    expect(reconcileOpts().ledgerComplete).toBe(false);
  });

  it("reports a complete read when the page holds the whole ledger", async () => {
    listApprovalRequests.mockResolvedValue({ requests: [{ id: "r-1" }], total: 1 });
    await call();
    expect(reconcileOpts().ledgerComplete).toBe(true);
  });

  it("treats an empty ledger as complete — nothing pending is a real answer", async () => {
    listApprovalRequests.mockResolvedValue({ requests: [], total: 0 });
    await call();
    expect(reconcileOpts().ledgerComplete).toBe(true);
  });

  it("surfaces a non-HttpError from the reconciler rather than reporting success", async () => {
    listApprovalRequests.mockResolvedValue({ requests: [], total: 0 });
    reconcileChannelApprovals.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(HttpError).toBeTruthy();
  });
});
