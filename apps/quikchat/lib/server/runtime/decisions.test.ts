/**
 * `approveRequest` / `rejectRequest` — the wire call and the stub.
 *
 * Own file rather than appended to `approvals.test.ts`: that file is about a
 * paginated GET, this is about two POSTs with a status-mapping table and a
 * not-idempotent contract. They share the endpoint family and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StubRuntimeClient, STUB_FAILING_REQUEST_ID } from "./stub";

const input = { orgId: "o1", userId: "u1", botAgentId: "bot-1", requestId: "req-9" };

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe("HttpRuntimeClient — the decision call", () => {
  beforeEach(() => {
    process.env.AGENT_JWT_SECRET = "test-agent-secret";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AGENT_JWT_SECRET;
  });

  it("POSTs to the approve path with the agent JWT and no body at all", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonRes({ requestId: "req-9", status: "executed" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await new HttpRuntimeClient("https://r").approveRequest({ ...input, traceId: "t-1" });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(opts.method).toBe("POST");
    expect(String(url)).toBe("https://r/ai/requests/req-9/approve");
    // ⚠️ Identity rides the TOKEN. There is deliberately NO body — nowhere for
    // an orgId/userId field to be added later "just to be safe".
    expect(opts.body).toBeUndefined();
    expect(String(url)).not.toContain("userId");
    expect(String(url)).not.toContain("orgId");

    const headers = opts.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);
    expect(headers["x-trace-id"]).toBe("t-1");
  });

  it("POSTs to the reject path for a rejection", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonRes({ requestId: "req-9", status: "rejected" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await new HttpRuntimeClient("https://r").rejectRequest(input);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://r/ai/requests/req-9/reject");
  });

  it("encodes an awkward request id into the path", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonRes({ requestId: "x", status: "executed" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await new HttpRuntimeClient("https://r").approveRequest({ ...input, requestId: "a/b?c" });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://r/ai/requests/a%2Fb%3Fc/approve");
  });

  /**
   * ⚠️ `status: "failed"` arrives on HTTP 200 and MUST resolve. The approval was
   * recorded; the target app refused the write. Throwing here would turn an
   * outcome into a transport error at the lowest level, where every consumer
   * above would inherit the mistake.
   */
  it("RESOLVES a 200 `failed` — a recorded approval whose write was refused", async () => {
    const body = {
      requestId: "req-9",
      status: "failed",
      errorCode: "APP_API_ERROR",
      error: "field 'dueDate' is in the past",
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(body)));
    const { HttpRuntimeClient } = await import("./http");

    await expect(new HttpRuntimeClient("https://r").approveRequest(input)).resolves.toEqual(body);
  });

  it("passes `result` interiors through untouched, target-app naming included", async () => {
    const result = { issueId: "QTRK-903", custom_field_7: { nested: [1, null] } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ requestId: "req-9", status: "executed", result })),
    );
    const { HttpRuntimeClient } = await import("./http");

    const decision = await new HttpRuntimeClient("https://r").approveRequest(input);
    expect(decision.result).toEqual(result);
    expect(Object.keys(decision.result!)).toEqual(["issueId", "custom_field_7"]);
  });

  it.each([
    [409, "already_handled"],
    [403, "forbidden"],
    [410, "tool_gone"],
    [404, "not_found"],
    [401, "bad_jwt"],
    [500, "unavailable"],
    [503, "unavailable"],
    [418, "unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({}, false, status)),
    );
    const { HttpRuntimeClient } = await import("./http");
    await expect(
      new HttpRuntimeClient("https://r").approveRequest(input),
    ).rejects.toMatchObject({ code, runtimeStatus: status });
  });

  it("maps the same statuses on reject — the two must not drift", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({}, false, 409)),
    );
    const { HttpRuntimeClient } = await import("./http");
    await expect(
      new HttpRuntimeClient("https://r").rejectRequest(input),
    ).rejects.toMatchObject({ code: "already_handled" });
  });

  /**
   * A timeout and a network fault are both throws, and they are NOT the same
   * thing: a network fault before the request left means nothing happened, while
   * a timeout means we do not know. Keeping them apart is what lets the relay
   * word the two differently — one says try again, the other says go and look.
   */
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
      new HttpRuntimeClient("https://r").approveRequest(input),
    ).rejects.toMatchObject({ code: "timeout" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(
      new HttpRuntimeClient("https://r").approveRequest(input),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

/**
 * The stub is the ONLY local source — `RUNTIME_MODE` is unset in development, so
 * every path a developer can reach by hand goes through here. That includes the
 * three that are easiest to get wrong: the 409 on a second tap, the 200 `failed`,
 * and a terminal row refusing to be re-decided.
 */
describe("StubRuntimeClient — decisions", () => {
  it("approves a pending fixture and reports executed", async () => {
    const decision = await new StubRuntimeClient().approveRequest({
      ...input,
      requestId: "stub-req-pending",
    });
    expect(decision).toMatchObject({ requestId: "stub-req-pending", status: "executed" });
    expect(decision.result).toBeTruthy();
  });

  it("rejects a pending fixture and reports rejected", async () => {
    const decision = await new StubRuntimeClient().rejectRequest({
      ...input,
      requestId: "stub-req-pending",
    });
    expect(decision).toMatchObject({ status: "rejected" });
  });

  /**
   * ⚠️ NOT IDEMPOTENT, and this is where that becomes reachable without the live
   * runtime. A stateless stub would answer every double-tap with a cheerful
   * `executed`, the card's latch would look unnecessary to the next reader, and
   * the first real 409 would arrive in UAT.
   */
  it("409s on the second decision for the same request — a double tap", async () => {
    const client = new StubRuntimeClient();
    await client.approveRequest({ ...input, requestId: "stub-req-pending" });
    await expect(
      client.approveRequest({ ...input, requestId: "stub-req-pending" }),
    ).rejects.toMatchObject({ code: "already_handled", runtimeStatus: 409 });
  });

  it("409s when the second tap is the OTHER button", async () => {
    const client = new StubRuntimeClient();
    await client.approveRequest({ ...input, requestId: "stub-req-pending" });
    await expect(
      client.rejectRequest({ ...input, requestId: "stub-req-pending" }),
    ).rejects.toMatchObject({ code: "already_handled" });
  });

  it("409s on a row that was already terminal", async () => {
    await expect(
      new StubRuntimeClient().approveRequest({ ...input, requestId: "stub-req-executed" }),
    ).rejects.toMatchObject({ code: "already_handled" });
  });

  it("404s an unknown id", async () => {
    await expect(
      new StubRuntimeClient().approveRequest({ ...input, requestId: "nope" }),
    ).rejects.toMatchObject({ code: "not_found", runtimeStatus: 404 });
  });

  /** The locally-reachable 200 `failed` — see STUB_FAILING_REQUEST_ID. */
  it("has one fixture whose approval succeeds and whose write fails", async () => {
    const decision = await new StubRuntimeClient().approveRequest({
      ...input,
      requestId: STUB_FAILING_REQUEST_ID,
    });
    expect(decision.status).toBe("failed");
    expect(decision.errorCode).toBe("APP_API_ERROR");
    expect(decision.error).toBeTruthy();
  });

  /**
   * `outcomeSummary` is served on the DECISION RESPONSE as well as the row, so
   * the live card shows the real outcome with no refetch. If the stub stopped
   * returning it, that path would silently fall back to the status label
   * locally and only the live runtime would show the difference.
   */
  it("returns outcomeSummary on both decisions, so the live card needs no refetch", async () => {
    const approved = await new StubRuntimeClient().approveRequest({
      ...input,
      requestId: "stub-req-pending",
    });
    expect(approved.outcomeSummary).toBe("Created QTRK-903 in QuikTrack.");

    const rejected = await new StubRuntimeClient().rejectRequest({
      ...input,
      requestId: "stub-req-pending",
    });
    expect(rejected.outcomeSummary).toBeTruthy();
  });

  /**
   * ⚠️ On a failed decision the summary does NOT carry the reason — that is the
   * point of keeping `error` beside it. The fixture is built so a card that
   * dropped `error` once the summary arrived loses the only actionable text, and
   * loses it locally rather than in UAT.
   */
  it("returns a summary that does NOT subsume the error on a failed decision", async () => {
    const decision = await new StubRuntimeClient().approveRequest({
      ...input,
      requestId: STUB_FAILING_REQUEST_ID,
    });
    expect(decision.outcomeSummary).toBeTruthy();
    expect(decision.error).toBeTruthy();
    expect(decision.outcomeSummary).not.toContain("dueDate");
    expect(decision.error).toContain("dueDate");
  });

  it("shows a decided row as decided on the next list read", async () => {
    const client = new StubRuntimeClient();
    await client.rejectRequest({ ...input, requestId: "stub-req-pending" });
    const page = await client.listApprovalRequests({ orgId: "o1", userId: "u1", botAgentId: "b" });
    expect(page.requests.find((r) => r.id === "stub-req-pending")!.status).toBe("rejected");
  });

  it("starts clean per instance, so tests never leak decisions into each other", async () => {
    await new StubRuntimeClient().approveRequest({ ...input, requestId: "stub-req-pending" });
    await expect(
      new StubRuntimeClient().approveRequest({ ...input, requestId: "stub-req-pending" }),
    ).resolves.toMatchObject({ status: "executed" });
  });
});
