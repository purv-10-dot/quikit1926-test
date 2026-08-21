/**
 * `POST /api/ai/requests/[id]/reject` — the twin of the approve route.
 *
 * Both endpoints delegate to `decideApprovalRequest`, so most of the mapping is
 * proven once next door. This file exists because the two routes are separately
 * REACHABLE: a wiring mistake here (wrong runtime method, wrong rate bucket,
 * looser gate, a body read that leaks identity) would not be caught by any
 * approve-side assertion. So it re-proves the load-bearing contract through this
 * door — the identity rule, 409, and that reject calls reject.
 *
 * Same mock-backed shape as the approve and list route tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const ORG = "org-1";
const ME = "u-me";

vi.mock("@/lib/auth-shims", async () => {
  const { HttpError: HE } = await import("@/lib/errors");
  return {
    HttpError: HE,
    withOrgAuth:
      (
        handler: (
          req: NextRequest,
          ctx: { orgId: string; userId: string },
          params: Record<string, string>,
        ) => Promise<Response>,
      ) =>
      async (req: NextRequest, context?: { params?: Record<string, string> }) => {
        try {
          return await handler(req, { orgId: ORG, userId: ME }, context?.params ?? {});
        } catch (e: unknown) {
          const status = e instanceof HE ? e.status : 500;
          return Response.json({ error: (e as Error).message }, { status });
        }
      },
  };
});

const userCan = vi.fn(async () => true);
vi.mock("@/lib/authz/permissions", () => ({
  userCan: (...a: unknown[]) => userCan(...(a as [])),
}));

const approveRequest = vi.fn();
const rejectRequest = vi.fn();
vi.mock("@/lib/server/runtime", () => ({
  getRuntimeClient: () => ({ approveRequest, rejectRequest }),
}));

vi.mock("@/lib/server/assistant.service", () => ({
  ASSISTANT_BOT_AGENT_ID: "bot-1",
}));

import { POST } from "./route";

const call = (id = "req-9", url = "http://test.local/api/ai/requests/req-9/reject") =>
  POST(new Request(url, { method: "POST" }) as unknown as NextRequest, { params: { id } });

beforeEach(() => {
  vi.clearAllMocks();
  userCan.mockResolvedValue(true);
  rejectRequest.mockResolvedValue({ requestId: "req-9", status: "rejected" });
});

describe("POST reject — gating is the SAME as approve, not looser", () => {
  /**
   * It is tempting to treat "no" as harmless. It is not: a reject consumes the
   * request, so a wrongly-permitted one is a denial of service on the
   * requester's action.
   */
  it("403s without the Assistant capability", async () => {
    userCan.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(rejectRequest).not.toHaveBeenCalled();
  });

  it("checks the same capability approve does", async () => {
    await call();
    expect(userCan).toHaveBeenCalledWith(ME, ORG, "Assistant", "create");
  });

  it("400s on a missing id", async () => {
    const res = await POST(
      new Request("http://test.local/api/ai/requests//reject", {
        method: "POST",
      }) as unknown as NextRequest,
      { params: {} },
    );
    expect(res.status).toBe(400);
    expect(rejectRequest).not.toHaveBeenCalled();
  });
});

describe("POST reject — identity is session-derived", () => {
  it("ignores userId and orgId from the query string entirely", async () => {
    await call("req-9", "http://test.local/api/ai/requests/req-9/reject?userId=someone&orgId=other");
    expect(rejectRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME, requestId: "req-9" }),
    );
  });

  it("ignores a body that tries to supply an identity", async () => {
    await POST(
      new Request("http://test.local/api/ai/requests/req-9/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-other", orgId: "org-other" }),
      }) as unknown as NextRequest,
      { params: { id: "req-9" } },
    );
    expect(rejectRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME }),
    );
  });

  it("always sends a traceId", async () => {
    await call();
    const arg = rejectRequest.mock.calls[0]![0] as { traceId?: string };
    expect(typeof arg.traceId).toBe("string");
    expect(arg.traceId).toBeTruthy();
  });
});

describe("POST reject — the wiring that only this file can catch", () => {
  /** The mistake a shared helper makes easy: rejecting by calling approve. */
  it("calls reject, never approve", async () => {
    await call();
    expect(rejectRequest).toHaveBeenCalledTimes(1);
    expect(approveRequest).not.toHaveBeenCalled();
  });

  it("relays the decision verbatim", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requestId: "req-9", status: "rejected" });
  });
});

describe("POST reject — errors map the same way", () => {
  async function rejectWith(code: string, status?: number) {
    const { ApprovalDecisionError } = await import("@/lib/server/runtime/types");
    rejectRequest.mockRejectedValue(new ApprovalDecisionError(code as "unavailable", status));
  }

  // A double-tapped Reject lands here exactly as a double-tapped Approve does.
  it("409s on an already-handled request", async () => {
    await rejectWith("already_handled", 409);
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("already_handled");
    expect(body.error).not.toMatch(/try again/i);
  });

  it.each([
    ["forbidden", 403],
    ["tool_gone", 410],
    ["not_found", 404],
    ["unavailable", 502],
    ["bad_jwt", 502],
    ["timeout", 504],
  ] as const)("maps %s to %i", async (code, status) => {
    await rejectWith(code);
    const res = await call();
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("504s on a timeout with the refresh wording, not a retry", async () => {
    await rejectWith("timeout");
    const body = await (await call()).json();
    expect(body.error).toMatch(/refresh/i);
    expect(body.error).not.toMatch(/try again/i);
  });

  it("502s on an unexpected throw", async () => {
    rejectRequest.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(502);
  });
});
