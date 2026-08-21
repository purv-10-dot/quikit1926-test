/**
 * `POST /api/ai/requests/[id]/approve` — the gates, the identity rule, the
 * "200 is an outcome" rule and every error status.
 *
 * Mock-backed and shaped exactly like `app/api/ai/requests/route.test.ts`:
 * `withOrgAuth` is unwrapped so the handler's own decisions are what is under
 * test, while its `HttpError` → status mapping is kept (the 403 assertion relies
 * on it). Every DB-backed route test in this app is excluded from Vitest, so a
 * DB-backed suite here would never execute.
 *
 * The reject twin lives next door and asserts the same contract through the
 * other endpoint; both go through `decideApprovalRequest`, and the duplication
 * is deliberate — the two routes are separately reachable, so they are
 * separately proven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/errors";

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

/** The App Router shape: a request plus the dynamic segment. */
const call = (id = "req-9", url = "http://test.local/api/ai/requests/req-9/approve") =>
  POST(new Request(url, { method: "POST" }) as unknown as NextRequest, { params: { id } });

async function rejectWith(code: string, status?: number) {
  const { ApprovalDecisionError } = await import("@/lib/server/runtime/types");
  approveRequest.mockRejectedValue(
    new ApprovalDecisionError(code as "unavailable", status),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  userCan.mockResolvedValue(true);
  approveRequest.mockResolvedValue({ requestId: "req-9", status: "executed", result: {} });
});

describe("POST approve — gating", () => {
  it("403s without the Assistant capability (Guests hold Channel:view only)", async () => {
    userCan.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(approveRequest).not.toHaveBeenCalled();
  });

  it("checks the same capability the assistant and the list require", async () => {
    await call();
    expect(userCan).toHaveBeenCalledWith(ME, ORG, "Assistant", "create");
  });

  it("400s on a missing id rather than calling the runtime with an empty one", async () => {
    const res = await POST(
      new Request("http://test.local/api/ai/requests//approve", {
        method: "POST",
      }) as unknown as NextRequest,
      { params: {} },
    );
    expect(res.status).toBe(400);
    expect(approveRequest).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ THE ONE THING THAT COULD GO QUIETLY WRONG, and it is sharper here than on
 * the list because this endpoint WRITES. Requester-only isolation depends on
 * orgId/userId coming from `ctx` and riding the minted token. Accepting either
 * from the caller turns "approve my own parked write" into "approve anyone's",
 * and it would look like ordinary parameter plumbing in review.
 */
describe("POST approve — identity is session-derived", () => {
  it("ignores userId and orgId from the query string entirely", async () => {
    await call("req-9", "http://test.local/api/ai/requests/req-9/approve?userId=someone&orgId=other");

    expect(approveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME, requestId: "req-9" }),
    );
  });

  it("ignores a body that tries to supply an identity", async () => {
    await POST(
      new Request("http://test.local/api/ai/requests/req-9/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-other", orgId: "org-other" }),
      }) as unknown as NextRequest,
      { params: { id: "req-9" } },
    );

    expect(approveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME }),
    );
  });

  it("ignores identity headers", async () => {
    await POST(
      new Request("http://test.local/api/ai/requests/req-9/approve", {
        method: "POST",
        headers: { "x-user-id": "u-other", "x-org-id": "org-other" },
      }) as unknown as NextRequest,
      { params: { id: "req-9" } },
    );

    expect(approveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME }),
    );
  });

  it("passes the request id from the path, and always a traceId", async () => {
    await call("req-42");
    const arg = approveRequest.mock.calls[0]![0] as { requestId: string; traceId?: string };
    expect(arg.requestId).toBe("req-42");
    expect(typeof arg.traceId).toBe("string");
    expect(arg.traceId).toBeTruthy();
  });

  it("calls approve, never reject", async () => {
    await call();
    expect(approveRequest).toHaveBeenCalledTimes(1);
    expect(rejectRequest).not.toHaveBeenCalled();
  });
});

describe("POST approve — success", () => {
  it("relays the decision verbatim, result interiors untouched", async () => {
    const result = { issueId: "QTRK-903", custom_field_7: [1, 2] };
    approveRequest.mockResolvedValue({ requestId: "req-9", status: "executed", result });

    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("executed");
    expect(body.result).toEqual(result);
    expect(Object.keys(body.result)).toEqual(["issueId", "custom_field_7"]);
  });

  /**
   * ⚠️ `status: "failed"` on HTTP 200. The approval was RECORDED and the target
   * app then refused the write — two failures in two systems, and only one is a
   * transport problem. A non-2xx here would tell the client to retry a decision
   * already consumed (landing on 409) and would bury `errorCode`/`error`, the
   * only part that says what went wrong.
   */
  it("returns 200 for a recorded approval whose write the target app refused", async () => {
    approveRequest.mockResolvedValue({
      requestId: "req-9",
      status: "failed",
      errorCode: "APP_API_ERROR",
      error: "field 'dueDate' is in the past",
    });

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.errorCode).toBe("APP_API_ERROR");
    expect(body.error).toBe("field 'dueDate' is in the past");
  });
});

describe("POST approve — every error means something different", () => {
  /**
   * 409 is the one to get right: it is where a double-tap lands, because
   * approval is deliberately not idempotent. The message must not invite a
   * retry, and the code must be on the body so the client can refetch.
   */
  it("409s on an already-handled or expired request, without inviting a retry", async () => {
    await rejectWith("already_handled", 409);
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("already_handled");
    expect(body.error).toMatch(/already handled/i);
    expect(body.error).not.toMatch(/try again/i);
  });

  it("403s when permission was revoked between proposal and approval", async () => {
    await rejectWith("forbidden", 403);
    const res = await call();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("forbidden");
    // "no longer" matters: without it this reads as though the card should
    // never have been shown.
    expect(body.error).toMatch(/no longer have permission/i);
  });

  it("410s when the tool was deregistered, distinctly from a permission problem", async () => {
    await rejectWith("tool_gone", 410);
    const res = await call();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe("tool_gone");
    expect(body.error).toMatch(/no longer available/i);
    expect(body.error).not.toMatch(/permission/i);
  });

  it("404s for an unknown id or another org's — one message for both", async () => {
    await rejectWith("not_found", 404);
    const res = await call();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("not_found");
    // Never "that exists but isn't yours" — the distinction is itself a leak.
    expect(body.error).toMatch(/no longer exists/i);
  });

  it("502s on a runtime 5xx — theirs, retryable", async () => {
    await rejectWith("unavailable", 503);
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("unavailable");
  });

  it("502s on a rejected token — ours, and never shown as the user's mistake", async () => {
    await rejectWith("bad_jwt", 401);
    const res = await call();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("bad_jwt");
    expect(body.error).not.toMatch(/permission/i);
  });

  /**
   * ⚠️ A timeout does NOT mean the decision failed — the runtime may have
   * recorded it and executed the write after our socket closed. Because approval
   * is not idempotent, "try again" is advice toward a 409 or a double write, so
   * the message has to send the user to LOOK instead. This assertion exists
   * because the obvious wording is the wrong one.
   */
  it("504s on a timeout and tells the user to refresh, never to try again", async () => {
    await rejectWith("timeout");
    const res = await call();
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.code).toBe("timeout");
    expect(body.error).toMatch(/may or may not/i);
    expect(body.error).toMatch(/refresh/i);
    expect(body.error).not.toMatch(/try again/i);
  });

  it("502s on an unexpected throw rather than leaking a 500", async () => {
    approveRequest.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("unavailable");
  });

  it("never returns a decision body on a failure", async () => {
    await rejectWith("already_handled", 409);
    const body = await (await call()).json();
    expect(body.status).toBeUndefined();
    expect(body.requestId).toBeUndefined();
  });
});

describe("route wiring", () => {
  it("HttpError is the mapping the handler relies on", () => {
    expect(new HttpError(403, "x").status).toBe(403);
  });
});
