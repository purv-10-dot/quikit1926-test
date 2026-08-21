import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectRuntimeMode } from "./index";
import { StubRuntimeClient } from "./stub";
import { parseSseBlock } from "./http";
import { IngestError } from "./types";
import type { AssistInput, IngestInput, RuntimeEvent } from "./types";

const ingestInput: IngestInput = {
  orgId: "o1",
  userId: "u1",
  botAgentId: "quikchat-assistant",
  storageKey: "quikchat/o1/c1/uuid-x.pdf",
  sourceFileId: "quikchat/o1/c1/uuid-x.pdf",
  appId: "quikchat",
  visibility: "PRIVATE",
  filename: "x.pdf",
};

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const input: AssistInput = {
  orgId: "o1",
  userId: "u1",
  channelId: "c1",
  prompt: "summarize",
  history: [{ role: "user", text: "hi", createdAt: new Date().toISOString() }],
  appId: "quikchat",
  locale: "en",
  botAgentId: "quikchat-assistant",
  traceId: "trace-1",
};

async function collect(it: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const out: RuntimeEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe("selectRuntimeMode", () => {
  it("defaults to stub", () => {
    expect(selectRuntimeMode({})).toEqual({ mode: "stub" });
    expect(selectRuntimeMode({ RUNTIME_MODE: "stub" })).toEqual({ mode: "stub" });
  });
  it("uses http only when base url is set", () => {
    expect(selectRuntimeMode({ RUNTIME_MODE: "http", RUNTIME_BASE_URL: "https://r" })).toEqual({
      mode: "http",
    });
  });
  it("falls back to stub (with warning) when http is misconfigured", () => {
    const r = selectRuntimeMode({ RUNTIME_MODE: "http" });
    expect(r.mode).toBe("stub");
    expect(r.warning).toBeTruthy();
  });
});

describe("StubRuntimeClient", () => {
  it("streams deltas then a done with an agentRunId", async () => {
    const events = await collect(new StubRuntimeClient().assist(input));
    expect(events.some((e) => e.type === "delta")).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.agentRunId).toMatch(/^stub-/);
      expect(done.text.length).toBeGreaterThan(0);
    }
  });

  it("emits an error in error mode (no done)", async () => {
    const events = await collect(new StubRuntimeClient({ errorMode: true }).assist(input));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("error");
  });

  it("ingest returns a deterministic result echoing the sourceFileId", async () => {
    const r = await new StubRuntimeClient().ingest(ingestInput);
    expect(r.sourceFileId).toBe(ingestInput.sourceFileId);
    expect(r.chunksStored).toBeGreaterThan(0);
    expect(typeof r.contentHash).toBe("string");
  });

  it("omits done.sources on a plain (non-KB) turn — back-compat", async () => {
    const events = await collect(new StubRuntimeClient().assist(input));
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.sources).toBeUndefined();
  });

  it("emits done.sources scoped to the given sourceFileIds on a KB turn", async () => {
    const events = await collect(
      new StubRuntimeClient().assist({
        ...input,
        knowledgeBase: { enabled: true, sourceFileIds: ["quikchat/o1/c1/doc-a.pdf"] },
      }),
    );
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.sources?.length).toBeGreaterThan(0);
      expect(done.sources![0]).toMatchObject({
        sourceFileId: "quikchat/o1/c1/doc-a.pdf",
        chunkIndex: 0,
      });
      expect(typeof done.sources![0]!.snippet).toBe("string");
    }
  });

  it("emits a synthetic done.sources on a whole-KB widen (enabled, no ids)", async () => {
    const events = await collect(
      new StubRuntimeClient().assist({ ...input, knowledgeBase: { enabled: true } }),
    );
    const done = events.at(-1);
    if (done?.type === "done") expect(done.sources?.length).toBeGreaterThan(0);
  });
});

describe("parseSseBlock", () => {
  it("parses a data: JSON RuntimeEvent", () => {
    expect(parseSseBlock('data: {"type":"delta","text":"hi"}')).toEqual({
      type: "delta",
      text: "hi",
    });
  });
  it("joins multi-line data and ignores keepalives/[DONE]", () => {
    expect(parseSseBlock(": keepalive")).toBeNull();
    expect(parseSseBlock("data: [DONE]")).toBeNull();
    expect(parseSseBlock('event: done\ndata: {"type":"done","text":"x","agentRunId":"a"}')).toEqual(
      { type: "done", text: "x", agentRunId: "a" },
    );
  });
});

// --- HttpRuntimeClient SSE parsing + auth + error mapping (mocked fetch) ---

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

describe("HttpRuntimeClient", () => {
  beforeEach(() => {
    process.env.AGENT_JWT_SECRET = "test-agent-secret";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AGENT_JWT_SECRET;
  });

  it("parses an SSE stream into events and attaches the agent JWT", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse([
        'data: {"type":"delta","text":"Hel"}\n\n',
        'data: {"type":"delta","text":"lo"}\n\n',
        'data: {"type":"done","text":"Hello","agentRunId":"run-9"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");
    const events = await collect(new HttpRuntimeClient("https://r").assist(input));

    expect(events.map((e) => e.type)).toEqual(["delta", "delta", "done"]);
    const opts = fetchMock.mock.calls[0]![1];
    expect(opts.method).toBe("POST");
    const headers = opts.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);
    // orgId/userId must NOT be in the body.
    const body = JSON.parse(opts.body as string);
    expect(body.orgId).toBeUndefined();
    expect(body.channelId).toBe("c1");
    // appId rides EVERY turn (toolset scoping), even a plain one.
    expect(body.appId).toBe("quikchat");
  });

  it("sends knowledgeBase NESTED when present; omits it on a plain turn", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse(['data: {"type":"done","text":"ok","agentRunId":"r1"}\n\n']),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");

    await collect(
      new HttpRuntimeClient("https://r").assist({
        ...input,
        knowledgeBase: { enabled: true, sourceFileIds: ["quikchat/o1/c1/doc-a.pdf"] },
      }),
    );
    const kbBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(kbBody.knowledgeBase).toEqual({
      enabled: true,
      sourceFileIds: ["quikchat/o1/c1/doc-a.pdf"],
    });
    expect(kbBody.appId).toBe("quikchat");

    await collect(new HttpRuntimeClient("https://r").assist(input));
    const plainBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(plainBody.knowledgeBase).toBeUndefined();
  });

  it("passes done.sources through the SSE parser to the caller", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse([
        'data: {"type":"done","text":"cited","agentRunId":"r2","sources":[{"sourceFileId":"quikchat/o1/c1/doc-a.pdf","chunkIndex":1,"snippet":"…"}]}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");
    const events = await collect(new HttpRuntimeClient("https://r").assist(input));
    const done = events.at(-1);
    if (done?.type === "done") {
      expect(done.sources).toEqual([
        { sourceFileId: "quikchat/o1/c1/doc-a.pdf", chunkIndex: 1, snippet: "…" },
      ]);
    }
  });

  it("forwards a document as flat top-level url + filename", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse(['data: {"type":"done","text":"ok","agentRunId":"r1"}\n\n']),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");
    await collect(
      new HttpRuntimeClient("https://r").assist({
        ...input,
        document: { url: "https://storage.googleapis.com/quikit-bucket/x.pdf", filename: "x.pdf" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.url).toBe("https://storage.googleapis.com/quikit-bucket/x.pdf");
    expect(body.filename).toBe("x.pdf");
    // Flat, top-level — NOT nested under `document`.
    expect(body.document).toBeUndefined();
  });

  it("omits url/filename on a plain turn (no document → back-compat body)", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      sseResponse(['data: {"type":"done","text":"ok","agentRunId":"r1"}\n\n']),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");
    await collect(new HttpRuntimeClient("https://r").assist(input));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.url).toBeUndefined();
    expect(body.filename).toBeUndefined();
  });

  it("maps a non-2xx response to an error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse([], false, 502)),
    );
    const { HttpRuntimeClient } = await import("./http");
    const events = await collect(new HttpRuntimeClient("https://r").assist(input));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("error");
  });

  it("maps a network throw to an error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    const { HttpRuntimeClient } = await import("./http");
    const events = await collect(new HttpRuntimeClient("https://r").assist(input));
    expect(events[0]).toMatchObject({ type: "error", code: "network" });
  });

  it("ingest POSTs top-level fields with the agent JWT and returns the result", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts: RequestInit) =>
      jsonResponse({ sourceFileId: ingestInput.storageKey, chunksStored: 42, contentHash: "abc" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { HttpRuntimeClient } = await import("./http");
    const result = await new HttpRuntimeClient("https://r").ingest(ingestInput);
    expect(result).toEqual({
      sourceFileId: ingestInput.storageKey,
      chunksStored: 42,
      contentHash: "abc",
    });
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://r/ai/ingest");
    expect((opts.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({
      storageKey: ingestInput.storageKey,
      sourceFileId: ingestInput.storageKey,
      appId: "quikchat",
      visibility: "PRIVATE",
      filename: "x.pdf",
    });
    // orgId/userId ride the JWT, never the body.
    expect(body.orgId).toBeUndefined();
    expect(body.userId).toBeUndefined();
  });

  it("ingest maps 404 → IngestError(object_not_found) and 422 → extract_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 404)));
    const { HttpRuntimeClient } = await import("./http");
    await expect(new HttpRuntimeClient("https://r").ingest(ingestInput)).rejects.toBeInstanceOf(
      IngestError,
    );
    await expect(new HttpRuntimeClient("https://r").ingest(ingestInput)).rejects.toMatchObject({
      code: "object_not_found",
    });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 422)));
    await expect(new HttpRuntimeClient("https://r").ingest(ingestInput)).rejects.toMatchObject({
      code: "extract_failed",
    });
  });
});

// --- Connect vs. idle timeout (fake timers + an abort-aware controllable body) ---
//
// The existing `sseResponse` enqueues synchronously and isn't wired to the abort
// signal, so it can't reproduce a real aborted body. This helper wires the
// fetch's `opts.signal` to `controller.error(AbortError)` — exactly how a real
// fetch errors a mid-stream body on abort — and hands the test manual
// enqueue/close control so timers can be advanced between chunks.

function controllableSse(): {
  fetch: ReturnType<typeof vi.fn>;
  enqueue: (s: string) => void;
  close: () => void;
} {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
        const signal = opts.signal;
        signal?.addEventListener("abort", () =>
          c.error(new DOMException("This operation was aborted", "AbortError")),
        );
      },
    });
    return { ok: true, status: 200, body: stream } as unknown as Response;
  });
  return {
    fetch: fetchMock,
    enqueue: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  };
}

describe("HttpRuntimeClient timeouts (connect vs. idle)", () => {
  beforeEach(() => {
    process.env.AGENT_JWT_SECRET = "test-agent-secret";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.AGENT_JWT_SECRET;
  });

  it("does NOT abort a slow-but-streaming response (total wall-clock > old 60s cap)", async () => {
    const s = controllableSse();
    vi.stubGlobal("fetch", s.fetch);
    const { HttpRuntimeClient } = await import("./http");

    const collected = collect(new HttpRuntimeClient("https://r").assist(input));
    // Let fetch resolve + reach the first read (idle armed).
    await vi.advanceTimersByTimeAsync(0);

    // Three deltas, 40s apart — each gap < 60s idle, total 120s (> the old 60s
    // total cap that used to abort mid-stream).
    for (let i = 0; i < 3; i++) {
      s.enqueue(`data: {"type":"delta","text":"x${i}"}\n\n`);
      await vi.advanceTimersByTimeAsync(40_000);
    }
    s.enqueue('data: {"type":"done","text":"done","agentRunId":"r"}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    s.close();

    const events = await collected;
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.filter((e) => e.type === "delta")).toHaveLength(3);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("still aborts a hung stream that opens but never sends a byte (idle guard)", async () => {
    const s = controllableSse(); // headers OK, body opens, nothing ever enqueued
    vi.stubGlobal("fetch", s.fetch);
    const { HttpRuntimeClient } = await import("./http");

    const collected = collect(new HttpRuntimeClient("https://r").assist(input));
    await vi.advanceTimersByTimeAsync(0); // reach the first read (idle armed)
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS_TEST); // no byte for the window → abort

    const events = await collected;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "stream" });
  });
});

// Mirrors IDLE_TIMEOUT_MS in ./http (kept local so the test needn't export it).
const IDLE_TIMEOUT_MS_TEST = 60_000;
