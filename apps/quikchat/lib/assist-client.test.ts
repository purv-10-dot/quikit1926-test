import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAssist, type AssistHandlers } from "./assist-client";

function sseResponse(chunks: string[], ok = true, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return { ok, status, body: stream } as unknown as Response;
}

function handlers() {
  const onDelta = vi.fn();
  const onDone = vi.fn();
  const onError = vi.fn();
  return { h: { onDelta, onDone, onError } as AssistHandlers, onDelta, onDone, onError };
}

/**
 * Same, plus the optional approval handler. Separate factory on purpose: the
 * absent-handler case is a real code path, so the default `handlers()` must keep
 * NOT supplying it.
 */
function handlersWithApproval() {
  const base = handlers();
  const onApprovalNeeded = vi.fn();
  return { ...base, h: { ...base.h, onApprovalNeeded } as AssistHandlers, onApprovalNeeded };
}

const APPROVAL_FRAME = JSON.stringify({
  type: "approval_needed",
  requestId: "er_9f2a",
  appId: "quiktrack",
  toolName: "create_issue",
  riskClass: "soft_write",
  summary: 'Create issue "Fix login" in QTRK, assigned to Priya Nair, priority HIGH',
  toolInput: { title: "Fix login", assignee: "priya", priority: "HIGH", nested: { a: [1, 2] } },
  expiresAt: "2026-08-14T09:12:00.000Z",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("streamAssist", () => {
  it("dispatches delta then done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"delta","text":"Hel"}\n\n',
          'data: {"type":"delta","text":"lo"}\n\ndata: {"type":"done","text":"Hello","agentRunId":"r1","clientMessageId":"assist-r1"}\n\n',
        ]),
      ),
    );
    const { h, onDelta, onDone, onError } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onDelta.mock.calls.map((c) => c[0])).toEqual(["Hel", "lo"]);
    expect(onDone).toHaveBeenCalledWith({
      type: "done",
      text: "Hello",
      agentRunId: "r1",
      clientMessageId: "assist-r1",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("carries the optional document ref in the POST body", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse([
        'data: {"type":"done","text":"ok","agentRunId":"r1","clientMessageId":"assist-r1"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { h } = handlers();
    await streamAssist(
      "c1",
      {
        prompt: "summarize this",
        document: {
          storageKey: "quikchat/o1/c1/uuid-invoice.pdf",
          filename: "invoice.pdf",
          contentType: "application/pdf",
        },
      },
      h,
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.prompt).toBe("summarize this");
    expect(body.document).toEqual({
      storageKey: "quikchat/o1/c1/uuid-invoice.pdf",
      filename: "invoice.pdf",
      contentType: "application/pdf",
    });
  });

  it("carries the optional nested knowledgeBase scope in the POST body", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse([
        'data: {"type":"done","text":"ok","agentRunId":"r1","clientMessageId":"assist-r1"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { h } = handlers();
    await streamAssist(
      "c1",
      { prompt: "what does it say?", knowledgeBase: { enabled: true, sourceFileIds: ["k1"] } },
      h,
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.knowledgeBase).toEqual({ enabled: true, sourceFileIds: ["k1"] });
  });

  it("threads done.sources through onDone (KB citations)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"done","text":"cited","agentRunId":"r1","clientMessageId":"assist-r1","sources":[{"sourceFileId":"k1","chunkIndex":0,"snippet":"…"}]}\n\n',
        ]),
      ),
    );
    const { h, onDone } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [{ sourceFileId: "k1", chunkIndex: 0, snippet: "…" }],
      }),
    );
  });

  it("dispatches an error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(['data: {"type":"error","message":"boom"}\n\n'])),
    );
    const { h, onError, onDone } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onError).toHaveBeenCalledWith("boom");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("calls onError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse([], false, 503)),
    );
    const { h, onError } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onError).toHaveBeenCalled();
  });

  // Loader-lifecycle contract: the caller's "thinking" state has exactly one
  // off-switch per turn, so every way a stream can end must produce exactly one
  // terminal callback — otherwise the loader hangs on forever.
  it("calls onError when the stream closes without a terminal event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(['data: {"type":"delta","text":"partial"}\n\n'])),
    );
    const { h, onDelta, onDone, onError } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onDelta).toHaveBeenCalledWith("partial");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("emits exactly one terminal callback (no close-error after done)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"done","text":"Hello","agentRunId":"r1","clientMessageId":"assist-r1"}\n\n',
          // Anything the server sends after `done` must not reopen the turn.
          'data: {"type":"delta","text":"late"}\n\n',
        ]),
      ),
    );
    const { h, onDelta, onDone, onError } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("stays silent when aborted (no error toast)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }),
    );
    const { h, onError, onDelta } = handlers();
    await streamAssist("c1", { prompt: "hi" }, h);
    expect(onError).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();
  });

  /**
   * `approval_needed` — the fourth SSE type, terminal like `done`/`error`.
   *
   * Before this handler existed, an unknown `type` fell through `dispatch`, the
   * stream closed with nothing terminal, and the caller got
   * "The assistant stream ended unexpectedly" — a working write proposal
   * rendering as a crash.
   */
  describe("approval_needed", () => {
    it("invokes onApprovalNeeded exactly once, with the frame passed through untouched", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => sseResponse([`data: ${APPROVAL_FRAME}\n\n`])),
      );
      const { h, onApprovalNeeded, onDone, onError } = handlersWithApproval();
      await streamAssist("c1", { prompt: "file a bug" }, h);

      expect(onApprovalNeeded).toHaveBeenCalledTimes(1);
      expect(onApprovalNeeded).toHaveBeenCalledWith({
        requestId: "er_9f2a",
        appId: "quiktrack",
        toolName: "create_issue",
        riskClass: "soft_write",
        // summary and toolInput must arrive byte-identical — not interpreted,
        // truncated or reformatted.
        summary: 'Create issue "Fix login" in QTRK, assigned to Priya Nair, priority HIGH',
        toolInput: { title: "Fix login", assignee: "priya", priority: "HIGH", nested: { a: [1, 2] } },
        expiresAt: "2026-08-14T09:12:00.000Z",
      });
      expect(onDone).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it("is terminal — a later delta is swallowed and no close-error fires", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          sseResponse([
            `data: ${APPROVAL_FRAME}\n\n`,
            'data: {"type":"delta","text":"late"}\n\n',
          ]),
        ),
      );
      const { h, onApprovalNeeded, onDelta, onError } = handlersWithApproval();
      await streamAssist("c1", { prompt: "file a bug" }, h);

      expect(onApprovalNeeded).toHaveBeenCalledTimes(1);
      expect(onDelta).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    /**
     * The absent-handler path. It must NOT produce "ended unexpectedly", and it
     * must NOT silently settle either — a silent settle suppresses the wrong
     * error and then hangs the caller's loader forever, which is worse.
     */
    it("with NO handler supplied: reports it honestly, never 'ended unexpectedly'", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => sseResponse([`data: ${APPROVAL_FRAME}\n\n`])),
      );
      const { h, onError, onDone } = handlers(); // deliberately no onApprovalNeeded
      await streamAssist("c1", { prompt: "file a bug" }, h);

      expect(onError).toHaveBeenCalledTimes(1);
      const msg = onError.mock.calls[0]![0] as string;
      expect(msg).not.toContain("ended unexpectedly");
      // The write IS parked server-side by now, so the copy must not imply
      // nothing happened.
      expect(msg).toContain("needs approval");
      expect(onDone).not.toHaveBeenCalled();
    });

    it("a malformed frame (no requestId) becomes one error, not a dropped terminal", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          sseResponse(['data: {"type":"approval_needed","appId":"quiktrack"}\n\n']),
        ),
      );
      const { h, onApprovalNeeded, onError } = handlersWithApproval();
      await streamAssist("c1", { prompt: "file a bug" }, h);

      expect(onApprovalNeeded).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0]).toContain("malformed");
      // Critically NOT the old fallback — the frame was terminal either way.
      expect(onError.mock.calls[0]![0]).not.toContain("ended unexpectedly");
    });

    // Lenient by design: rejecting a real, already-parked write because the
    // runtime added a fourth risk class would be worse than rendering it
    // conservatively. The card treats unknown as highest risk.
    it("passes an unrecognised riskClass through rather than rejecting the frame", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          sseResponse([
            'data: {"type":"approval_needed","requestId":"er_1","riskClass":"catastrophic"}\n\n',
          ]),
        ),
      );
      const { h, onApprovalNeeded, onError } = handlersWithApproval();
      await streamAssist("c1", { prompt: "x" }, h);

      expect(onError).not.toHaveBeenCalled();
      expect(onApprovalNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "er_1", riskClass: "catastrophic" }),
      );
    });
  });
});
