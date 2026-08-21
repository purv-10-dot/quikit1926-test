/**
 * `listApprovalRequests` — the data path for the approvals surface.
 *
 * Own file rather than appended to `runtime.test.ts`: that file's helpers are all
 * SSE-shaped (`sseResponse`, `collect`) and this is a plain JSON GET, so it
 * shares nothing with them.
 *
 * The list is deliberately UNFILTERED — pending plus terminal rows from the last
 * 24h — so these assert that terminal rows survive rather than being narrowed
 * away, and that the target app's own key naming inside `toolInput` is never
 * normalised in transit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StubRuntimeClient } from "./stub";

const listInput = { orgId: "o1", userId: "u1", botAgentId: "bot-1" };

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe("HttpRuntimeClient.listApprovalRequests", () => {
  beforeEach(() => {
    process.env.AGENT_JWT_SECRET = "test-agent-secret";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AGENT_JWT_SECRET;
  });

  it("GETs /ai/requests with the agent JWT, and never puts identity in the query", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonRes({ requests: [], total: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await new HttpRuntimeClient("https://r").listApprovalRequests({
      ...listInput,
      limit: 25,
      offset: 50,
      traceId: "t-1",
    });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(opts.method).toBe("GET");
    expect(String(url)).toContain("/ai/requests?");
    expect(String(url)).toContain("limit=25");
    expect(String(url)).toContain("offset=50");
    // Identity rides the TOKEN. A query param here would let a caller ask for
    // someone else's ledger — the one thing that could go quietly wrong.
    expect(String(url)).not.toContain("userId");
    expect(String(url)).not.toContain("orgId");

    const headers = opts.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);
    // x-trace-id is standard on this surface, not optional: an approval is the
    // thing most likely to need tracing across two systems after the fact.
    expect(headers["x-trace-id"]).toBe("t-1");
  });

  it("passes toolInput through byte-identical, without camelCasing the interior", async () => {
    // Target app's own naming, including a snake_case key a naive normaliser
    // would rewrite.
    const toolInput = {
      projectId: "QTRK",
      assigneeId: "u-priya",
      custom_field_7: { nested: ["a", 1, null] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes({
          requests: [{ id: "r1", toolName: "create_issue", toolInput, mode: "copilot" }],
          total: 1,
        }),
      ),
    );
    const { HttpRuntimeClient } = await import("./http");

    const page = await new HttpRuntimeClient("https://r").listApprovalRequests(listInput);
    expect(page.requests[0]!.toolInput).toEqual(toolInput);
    // Key for key, in order — nothing added, renamed or dropped.
    expect(Object.keys(page.requests[0]!.toolInput)).toEqual([
      "projectId",
      "assigneeId",
      "custom_field_7",
    ]);
  });

  it("keeps terminal rows — narrowing to pending would hide an expired write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes({
          requests: [
            { id: "a", status: "pending" },
            { id: "b", status: "expired" },
            { id: "c", status: "rejected" },
            { id: "d", status: "executed" },
            { id: "e", status: "failed" },
          ],
          total: 5,
        }),
      ),
    );
    const { HttpRuntimeClient } = await import("./http");

    const page = await new HttpRuntimeClient("https://r").listApprovalRequests(listInput);
    expect(page.requests.map((r) => r.status)).toEqual([
      "pending",
      "expired",
      "rejected",
      "executed",
      "failed",
    ]);
  });

  // A FAILED read must never resolve to an empty page: `{ requests: [] }` means
  // "you have none", a failure means "we don't know", and they look identical on
  // screen while meaning opposite things.
  it("throws rather than returning an empty page on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({}, false, 500)),
    );
    const { HttpRuntimeClient } = await import("./http");
    const { ListApprovalsError } = await import("./types");

    await expect(
      new HttpRuntimeClient("https://r").listApprovalRequests(listInput),
    ).rejects.toBeInstanceOf(ListApprovalsError);
  });

  it("maps 401 to bad_jwt and other statuses to unavailable", async () => {
    const { HttpRuntimeClient } = await import("./http");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({}, false, 401)),
    );
    await expect(
      new HttpRuntimeClient("https://r").listApprovalRequests(listInput),
    ).rejects.toMatchObject({ code: "bad_jwt" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({}, false, 503)),
    );
    await expect(
      new HttpRuntimeClient("https://r").listApprovalRequests(listInput),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("distinguishes a timeout (abort) from a network fault", async () => {
    const { HttpRuntimeClient } = await import("./http");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }),
    );
    await expect(
      new HttpRuntimeClient("https://r").listApprovalRequests(listInput),
    ).rejects.toMatchObject({ code: "timeout" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(
      new HttpRuntimeClient("https://r").listApprovalRequests(listInput),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("omits the query string entirely when no paging is asked for", async () => {
    // Params declared so `mock.calls[0]` is a typed tuple, not `[]`.
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonRes({ requests: [], total: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await new HttpRuntimeClient("https://r").listApprovalRequests(listInput);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://r/ai/requests");
  });
});

/**
 * The stub returns FIXTURES, not an empty page.
 *
 * The seeded rows live in the runtime's UAT database, so with `RUNTIME_MODE`
 * unset locally this stub is the ONLY source. An empty one would mean every
 * local developer — and the card session that follows — builds against a
 * permanently empty list, and "renders nothing" would look correct until UAT.
 */
describe("StubRuntimeClient.listApprovalRequests", () => {
  it("covers every state that renders differently", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    expect(page.total).toBe(7);
    // SEVEN rows, SIX states. Two pairs share a status because what differs is
    // not the state but what the card does with it:
    //
    //   the second `pending` — its APPROVAL answers `status: "failed"` on HTTP
    //     200, the one response most likely to be mistaken for a network error
    //     (STUB_FAILING_REQUEST_ID);
    //   the second `executed` — its `decisionBy` is a user in no channel roster,
    //     so the card cannot name them and must fall back to passive voice
    //     without ever printing the raw id (STUB_DEPARTED_REQUEST_ID).
    expect(page.requests.map((r) => r.status)).toEqual([
      "pending",
      "pending",
      "expired",
      "rejected",
      "executed",
      "cancelled",
      "executed",
    ]);
  });

  /**
   * `cancelled` is not `rejected`: the tenant disabled the module while the
   * request sat parked, so there is no human decider. `decisionBy: null` is what
   * makes the card's passive wording reachable locally rather than only in a
   * unit test.
   */
  it("has a cancelled row with no human decider", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    const cancelled = page.requests.find((r) => r.status === "cancelled")!;
    expect(cancelled).toBeTruthy();
    expect(cancelled.decisionBy).toBeNull();
  });

  /**
   * `outcomeSummary` is OPTIONAL, and rows predating it are ordinary traffic in
   * a 24h ledger that spans the deploy. Exactly one terminal fixture omits it,
   * so a card that renders blank for those breaks locally rather than first in
   * UAT — the same instinct as the snake_case key in `toolInput`.
   */
  it("carries outcomeSummary on terminal rows, and deliberately omits it on one", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    const terminal = page.requests.filter((r) => r.status !== "pending");
    const without = terminal.filter((r) => !r.outcomeSummary);

    expect(terminal.length).toBeGreaterThan(1);
    // EXACTLY one, and named — so the gap stays deliberate. A second fixture
    // drifting into "no summary" would make the fallback look like the norm and
    // would stop this fixture set proving anything about the field's presence.
    expect(without.map((r) => r.id)).toEqual(["stub-req-cancelled"]);
    expect(page.requests.find((r) => r.id === "stub-req-executed")!.outcomeSummary).toBe(
      "Created QTRK-902 in QuikTrack.",
    );
  });

  it("never puts outcomeSummary on a pending row — nothing has happened yet", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    for (const r of page.requests.filter((x) => x.status === "pending")) {
      expect(r.outcomeSummary).toBeUndefined();
    }
  });

  it("scopes rows to the caller and carries the dead mode field", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    for (const r of page.requests) {
      expect(r.orgId).toBe("o1");
      expect(r.userId).toBe("u1");
      // Always "copilot" — carried so the payload round-trips, never surfaced.
      expect(r.mode).toBe("copilot");
    }
  });

  it("uses the TARGET app's key naming inside toolInput, not ours", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    const pending = page.requests.find((r) => r.id === "stub-req-pending")!;
    // A consumer that normalises interiors breaks against the stub, not only
    // against UAT — which only holds if a fixture actually CARRIES a key a
    // normaliser would rewrite. Until 18 Aug every interior here was already
    // camelCase, so the guard was decorative and a normalising consumer passed
    // every local run. `custom_field_7` is the one that makes it real.
    expect(pending.toolInput).toEqual({
      projectId: "QTRK",
      title: "Login fails on Safari",
      assigneeId: "u-priya",
      custom_field_7: { nested: ["a", 1, null] },
    });
    expect(Object.keys(pending.toolInput)).toContain("custom_field_7");
  });

  it("includes an already-expired row, so an unactioned write stays visible", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests(listInput);
    const expired = page.requests.find((r) => r.status === "expired")!;
    expect(Date.parse(expired.expiresAt!)).toBeLessThan(Date.parse("2026-08-14T09:00:00.000Z"));
  });

  it("honours limit/offset while total stays the unpaged count", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests({
      ...listInput,
      limit: 2,
      offset: 1,
    });
    expect(page.requests.map((r) => r.status)).toEqual(["pending", "expired"]);
    // Unpaged, so it counts the departed-decider fixture too.
    expect(page.total).toBe(7);
  });

  /**
   * `total` is the UNPAGED count, and the stub modelled it that way from the
   * start. That matters more than it looks: the live endpoint used to return the
   * page size, so `hidden = total - requests.length` in ApprovalsSection was
   * always 0 and the "Showing N of M" footer was correct code that could never
   * fire. The runtime now returns a real COUNT(*), so it starts working — and
   * this assertion is what proves our side was right all along.
   */
  it("reports total as the unpaged count, not the page size", async () => {
    const page = await new StubRuntimeClient().listApprovalRequests({ ...listInput, limit: 2 });
    expect(page.requests).toHaveLength(2);
    expect(page.total).toBe(7);
    expect(page.total).not.toBe(page.requests.length);
  });

  it("is deterministic across calls", async () => {
    const a = await new StubRuntimeClient().listApprovalRequests(listInput);
    const b = await new StubRuntimeClient().listApprovalRequests(listInput);
    expect(a).toEqual(b);
  });
});
