/**
 * `GET /api/ai/requests` — the approvals relay's auth, gating and error shape.
 *
 * Mock-backed: `withOrgAuth` is unwrapped so the handler's own decisions are
 * what's under test, keeping its `HttpError` → status mapping (which the 403/504
 * assertions rely on). Same approach as the other runnable route tests in this
 * app, and for the same reason — every DB-backed route test here is excluded from
 * Vitest, so a DB-backed suite would never execute.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/errors";

const ORG = "org-1";
const ME = "u-me";

// Unwrap withOrgAuth but keep the HttpError → status mapping. The wrapper's own
// gates (session, app access, rate limit, module gate) are its own tests'
// business; what matters here is what the handler does once inside.
vi.mock("@/lib/auth-shims", async () => {
  const { HttpError: HE } = await import("@/lib/errors");
  return {
    HttpError: HE,
    withOrgAuth:
      (handler: (req: NextRequest, ctx: { orgId: string; userId: string }) => Promise<Response>) =>
      async (req: NextRequest) => {
        try {
          return await handler(req, { orgId: ORG, userId: ME });
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

const listApprovalRequests = vi.fn();
vi.mock("@/lib/server/runtime", () => ({
  getRuntimeClient: () => ({ listApprovalRequests }),
}));

vi.mock("@/lib/server/assistant.service", () => ({
  ASSISTANT_BOT_AGENT_ID: "bot-1",
}));

import { GET } from "./route";

const req = (qs = "") =>
  new Request(`http://test.local/api/ai/requests${qs}`) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  userCan.mockResolvedValue(true);
  listApprovalRequests.mockResolvedValue({ requests: [], total: 0 });
});

describe("GET /api/ai/requests — gating", () => {
  it("403s without the Assistant capability (Guests hold Channel:view only)", async () => {
    userCan.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(listApprovalRequests).not.toHaveBeenCalled();
  });

  it("checks the same capability the assistant itself requires", async () => {
    await GET(req());
    expect(userCan).toHaveBeenCalledWith(ME, ORG, "Assistant", "create");
  });
});

describe("GET /api/ai/requests — identity is session-derived", () => {
  /**
   * THE thing that could go quietly wrong. Requester-only isolation depends on
   * orgId/userId coming from `ctx` and riding the minted token; accepting either
   * from the caller would turn this into "ask for anyone's ledger" and would look
   * like ordinary parameter plumbing in review.
   */
  it("ignores userId and orgId from the query string entirely", async () => {
    await GET(req("?userId=someone-else&orgId=other-org&limit=5"));

    expect(listApprovalRequests).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, userId: ME, limit: 5 }),
    );
  });

  it("always sends a traceId", async () => {
    await GET(req());
    const arg = listApprovalRequests.mock.calls[0]![0] as { traceId?: string };
    expect(typeof arg.traceId).toBe("string");
    expect(arg.traceId).toBeTruthy();
  });
});

describe("GET /api/ai/requests — paging", () => {
  it("defaults, clamps to the ceiling, and floors a negative offset", async () => {
    await GET(req());
    expect(listApprovalRequests.mock.calls[0]![0]).toMatchObject({ limit: 50, offset: 0 });

    await GET(req("?limit=9999"));
    expect(listApprovalRequests.mock.calls[1]![0]).toMatchObject({ limit: 100 });

    await GET(req("?offset=-5"));
    expect(listApprovalRequests.mock.calls[2]![0]).toMatchObject({ offset: 0 });
  });

  it("falls back to defaults on non-numeric paging", async () => {
    await GET(req("?limit=abc&offset=xyz"));
    expect(listApprovalRequests.mock.calls[0]![0]).toMatchObject({ limit: 50, offset: 0 });
  });
});

describe("GET /api/ai/requests — pass-through and failure shape", () => {
  it("relays the page verbatim, interiors untouched", async () => {
    const toolInput = { projectId: "QTRK", assigneeId: "u-priya", custom_field_7: [1, 2] };
    listApprovalRequests.mockResolvedValue({
      requests: [{ id: "r1", status: "pending", mode: "copilot", toolInput }],
      total: 1,
    });

    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requests[0].toolInput).toEqual(toolInput);
    // `mode` is carried through rather than stripped — dead, but the payload
    // should round-trip honestly.
    expect(body.requests[0].mode).toBe("copilot");
  });

  it("relays terminal rows — it does not narrow to pending", async () => {
    listApprovalRequests.mockResolvedValue({
      requests: [
        { id: "a", status: "pending" },
        { id: "b", status: "expired" },
        { id: "c", status: "executed" },
      ],
      total: 3,
    });
    const body = await (await GET(req())).json();
    expect(body.requests.map((r: { status: string }) => r.status)).toEqual([
      "pending",
      "expired",
      "executed",
    ]);
  });

  /**
   * A failed read must NOT render as an empty inbox. These assert the relay
   * returns an error status with a message rather than a synthesised empty page —
   * an empty list and a timed-out list look identical and mean opposite things.
   */
  it("504s on a timeout, and never returns an empty page", async () => {
    const { ListApprovalsError } = await import("@/lib/server/runtime/types");
    listApprovalRequests.mockRejectedValue(new ListApprovalsError("timeout"));

    const res = await GET(req());
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.requests).toBeUndefined();
    expect(body.error).toMatch(/try again/i);
  });

  it("502s when the service is unreachable", async () => {
    const { ListApprovalsError } = await import("@/lib/server/runtime/types");
    listApprovalRequests.mockRejectedValue(new ListApprovalsError("unavailable", 503));

    const res = await GET(req());
    expect(res.status).toBe(502);
    expect((await res.json()).requests).toBeUndefined();
  });

  it("502s on an unexpected throw rather than leaking a 500 empty page", async () => {
    listApprovalRequests.mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect((await res.json()).requests).toBeUndefined();
  });
});

describe("route wiring", () => {
  it("HttpError is the mapping the handler relies on", () => {
    expect(new HttpError(504, "x").status).toBe(504);
  });
});
