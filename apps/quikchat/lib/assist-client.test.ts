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
});
