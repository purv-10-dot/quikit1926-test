import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectRuntimeMode } from "./index";
import { StubRuntimeClient } from "./stub";
import { parseSseBlock } from "./http";
import type { AssistInput, RuntimeEvent } from "./types";

const input: AssistInput = {
  orgId: "o1",
  userId: "u1",
  channelId: "c1",
  prompt: "summarize",
  history: [{ role: "user", text: "hi", createdAt: new Date().toISOString() }],
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
});
