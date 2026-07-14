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
