import { expect, test } from 'vitest';
import { AIClient, QuikitAI } from '../client';
import { AIError, AITimeoutError, AIValidationError } from '../errors';
import type { AIExecuteResponse } from '../types';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function installFetchMock(
  handler: (call: FetchCall) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const call: FetchCall = { url, init: init ?? {} };
    calls.push(call);
    const result = await handler(call);
    const text = result.body === undefined ? '' : JSON.stringify(result.body);
    return new Response(text, {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/**
 * Mock `fetch` with a verbatim body string, bypassing `JSON.stringify` so a
 * test can deliver a truncated or non-JSON payload on a 2xx.
 */
function installRawBodyFetchMock(
  rawBody: string,
  status = 200,
): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(rawBody, {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/**
 * Await `fn` and return whatever it threw. Fails the test if it resolves.
 * Replaces `node:assert`'s `rejects(fn, predicate)` so each predicate's
 * property assertions stay explicit and individually reported.
 */
async function captureRejection(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject, but it resolved');
}

function successResponse(): AIExecuteResponse {
  return {
    mode: 'manual',
    traceId: 'trace-123',
    normalizedText: 'hello world',
    structuredJson: { ok: true },
    providerUsed: 'gemini',
    modelUsed: 'gemini-2.5-flash',
    tokensInput: 10,
    tokensOutput: 20,
    tokensUsed: { inputTokens: 10, outputTokens: 20 },
    costEstimateUsd: 0.0001,
    latencyMs: 200,
    retryCount: 0,
    gracefulFallback: false,
  };
}

test('execute sends correct request shape', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'test-jwt',
      defaultAppId: 'crm',
    });
    const response = await client.execute({
      appId: 'crm',
      useCase: 'lead.summary',
      userPrompt: 'summarize this lead',
      expectedOutputType: 'text',
    });
    expect(mock.calls.length).toBe(1);
    const call = mock.calls[0]!;
    expect(call.url).toBe('https://ai.quikit.ai/ai/execute');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-jwt');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(call.init.body as string);
    expect(body.appId).toBe('crm');
    expect(body.useCase).toBe('lead.summary');
    expect(body.userPrompt).toBe('summarize this lead');
    expect(body.expectedOutputType).toBe('text');
    expect(response.traceId).toBe('trace-123');
    expect(response.normalizedText).toBe('hello world');
  } finally {
    mock.restore();
  }
});

test('executeText returns normalizedText directly', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const text = await client.executeText('lead.summary', 'summarize');
    expect(text).toBe('hello world');
  } finally {
    mock.restore();
  }
});

test('executeStructured returns structuredJson', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const result = await client.executeStructured<{ ok: boolean }>(
      'lead.classify',
      'classify',
      { type: 'object' },
    );
    expect(result.ok).toBe(true);
    const body = JSON.parse(mock.calls[0]!.init.body as string);
    expect(body.expectedOutputType).toBe('json');
    expect(body.responseSchema).toEqual({ type: 'object' });
  } finally {
    mock.restore();
  }
});

test('executeWithTools sends action expectedOutputType and toolsAllowed', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    await client.executeWithTools('crm.action', 'do it', ['create_task', 'send_email']);
    const body = JSON.parse(mock.calls[0]!.init.body as string);
    expect(body.expectedOutputType).toBe('action');
    expect(body.toolsAllowed).toEqual(['create_task', 'send_email']);
  } finally {
    mock.restore();
  }
});

test('HTTP 422 throws AIValidationError with traceId', async () => {
  const mock = installFetchMock(() => ({
    status: 422,
    body: { errorCode: 'SCHEMA_MISMATCH', detail: 'bad schema', traceId: 'trace-err' },
  }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'json',
      }),
    );
    expect(err).toBeInstanceOf(AIValidationError);
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('SCHEMA_MISMATCH');
    expect((err as AIError).traceId).toBe('trace-err');
    expect((err as AIError).status).toBe(422);
  } finally {
    mock.restore();
  }
});

test('HTTP 500 throws AIError', async () => {
  const mock = installFetchMock(() => ({
    status: 500,
    body: { errorCode: 'AI_UNAVAILABLE', detail: 'providers down', traceId: 'trace-5xx' },
  }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'text',
      }),
    );
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('AI_UNAVAILABLE');
    expect((err as AIError).status).toBe(500);
    expect((err as AIError).traceId).toBe('trace-5xx');
  } finally {
    mock.restore();
  }
});

test('timeout throws AITimeoutError', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  }) as typeof globalThis.fetch;
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
      timeoutMs: 50,
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'text',
      }),
    );
    expect(err).toBeInstanceOf(AITimeoutError);
    expect((err as AIError).code).toBe('TIMEOUT');
  } finally {
    globalThis.fetch = original;
  }
});

test('QuikitAI alias is the same class as AIClient', () => {
  expect(QuikitAI).toBe(AIClient);
  const instance = new QuikitAI({
    baseUrl: 'https://ai.quikit.ai',
    getToken: () => 'tok',
  });
  expect(instance).toBeInstanceOf(AIClient);
});

test('withFallback calls fn(err) on AIError and returns undefined', async () => {
  const mock = installFetchMock(() => ({
    status: 500,
    body: { errorCode: 'AI_UNAVAILABLE', detail: 'down', traceId: 'tr' },
  }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    let captured: AIError | undefined;
    const proxy = client.withFallback((err) => {
      captured = err;
    });
    const result = await proxy.execute({
      appId: 'crm',
      useCase: 'x',
      userPrompt: 'y',
      expectedOutputType: 'text',
    });
    expect(result).toBeUndefined();
    expect(captured).toBeInstanceOf(AIError);
    expect(captured?.code).toBe('AI_UNAVAILABLE');
  } finally {
    mock.restore();
  }
});

test('withFallback fn signature works without parameter', async () => {
  const mock = installFetchMock(() => ({
    status: 500,
    body: { errorCode: 'AI_UNAVAILABLE', detail: 'down' },
  }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    let called = false;
    const proxy = client.withFallback(() => {
      called = true;
    });
    const result = await proxy.executeText('x', 'y');
    expect(result).toBeUndefined();
    expect(called).toBe(true);
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────
// Malformed success responses — a 2xx whose body is unusable
//
// This is the failure mode that used to break through `withFallback`: the
// body parsed to `undefined`, was returned as-is, and the caller's first
// property access threw a raw `TypeError` — not an `AIError`, so the
// fallback proxy rethrew it and the screen broke.
// ─────────────────────────────────────────────────────────────────

test('200 with an empty body throws AIError, not a raw TypeError', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: undefined }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'text',
      }),
    );
    expect(err).toBeInstanceOf(AIError);
    expect(err).not.toBeInstanceOf(TypeError);
    expect((err as AIError).code).toBe('MALFORMED_RESPONSE');
    expect((err as AIError).status).toBe(200);
  } finally {
    mock.restore();
  }
});

test('200 with a truncated JSON body throws AIError', async () => {
  const mock = installRawBodyFetchMock('{"normalizedText": "hel');
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'text',
      }),
    );
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('MALFORMED_RESPONSE');
    expect((err as AIError).message).toContain('not valid JSON');
  } finally {
    mock.restore();
  }
});

test('200 with valid JSON that is not an object throws AIError', async () => {
  const mock = installRawBodyFetchMock('null');
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.execute({
        appId: 'crm',
        useCase: 'x',
        userPrompt: 'y',
        expectedOutputType: 'text',
      }),
    );
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('MALFORMED_RESPONSE');
    expect((err as AIError).message).toContain('not a JSON object');
  } finally {
    mock.restore();
  }
});

// The load-bearing regression test: this is the exact path that used to
// throw through `withFallback` and break the screen.
test('withFallback degrades on an empty-but-200 response instead of throwing', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: undefined }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    let captured: AIError | undefined;
    const result = await client
      .withFallback((err) => {
        captured = err;
      })
      .executeText('lead.summary', 'summarize');
    expect(result).toBeUndefined();
    expect(captured).toBeInstanceOf(AIError);
    expect(captured?.code).toBe('MALFORMED_RESPONSE');
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────
// executeStream — SSE streaming
// ─────────────────────────────────────────────────────────────────

interface SseFetchCall {
  url: string;
  init: RequestInit;
}

/**
 * Mock `fetch` with an SSE (`text/event-stream`) body built from raw event
 * chunks. Each string is enqueued verbatim, so tests control event framing
 * (including split boundaries and keepalive comment lines).
 */
function installSseFetchMock(
  chunks: string[],
  status = 200,
): { calls: SseFetchCall[]; restore: () => void } {
  const calls: SseFetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(stream, {
      status,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const DONE_EVENT =
  'event: done\ndata: ' +
  JSON.stringify({
    type: 'done',
    traceId: 'trace-stream',
    mode: 'manual',
    providerUsed: 'gemini',
    modelUsed: 'gemini-2.5-flash',
    tokensInput: 12,
    tokensOutput: 34,
    costEstimateUsd: 0.0002,
    latencyMs: 1500,
    fallback: false,
    partial: false,
    normalizedText: 'Hello world',
    structuredJson: null,
    sessionId: 'sess-1',
  }) +
  '\n\n';

test('executeStream posts to the stream endpoint with bearer auth', async () => {
  const mock = installSseFetchMock([
    'event: token\ndata: {"type":"token","text":"Hi"}\n\n',
    DONE_EVENT,
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'stream-jwt',
      defaultAppId: 'crm',
    });
    await client.executeStream('lead.summary', 'summarize', () => {});
    expect(mock.calls.length).toBe(1);
    const call = mock.calls[0]!;
    expect(call.url).toBe('https://ai.quikit.ai/ai/execute/stream');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer stream-jwt');
    expect(headers.accept).toBe('text/event-stream');
    const body = JSON.parse(call.init.body as string);
    expect(body.appId).toBe('crm');
    expect(body.useCase).toBe('lead.summary');
    expect(body.expectedOutputType).toBe('text');
  } finally {
    mock.restore();
  }
});

test('executeStream calls onToken per chunk and resolves with the done response', async () => {
  const mock = installSseFetchMock([
    'event: token\ndata: {"type":"token","text":"Hello "}\n\n',
    'event: token\ndata: {"type":"token","text":"world"}\n\n',
    DONE_EVENT,
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const tokens: string[] = [];
    const response = await client.executeStream('u', 'p', (chunk) => tokens.push(chunk));
    expect(tokens).toEqual(['Hello ', 'world']);
    expect(response.traceId).toBe('trace-stream');
    expect(response.normalizedText).toBe('Hello world');
    expect(response.providerUsed).toBe('gemini');
    expect(response.tokensOutput).toBe(34);
    expect(response.fallback).toBe(false);
    expect(response.partial).toBe(false);
    expect(response.sessionId).toBe('sess-1');
  } finally {
    mock.restore();
  }
});

test('executeStream ignores keepalive comments and surfaces status via onStatus', async () => {
  const mock = installSseFetchMock([
    'event: status\ndata: {"type":"status","stage":"setup","message":"Preparing request..."}\n\n',
    ': keepalive\n\n',
    'event: token\ndata: {"type":"token","text":"ok"}\n\n',
    ': keepalive\n\n',
    DONE_EVENT,
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const statuses: Array<[string, string]> = [];
    const tokens: string[] = [];
    await client.executeStream('u', 'p', (c) => tokens.push(c), {
      onStatus: (stage, message) => statuses.push([stage, message]),
    });
    expect(tokens).toEqual(['ok']);
    expect(statuses).toEqual([['setup', 'Preparing request...']]);
  } finally {
    mock.restore();
  }
});

test('executeStream handles events split across read chunks', async () => {
  // A single SSE event delivered in two byte chunks (split mid-JSON).
  const mock = installSseFetchMock([
    'event: token\ndata: {"type":"to',
    'ken","text":"split"}\n\n',
    DONE_EVENT,
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const tokens: string[] = [];
    await client.executeStream('u', 'p', (c) => tokens.push(c));
    expect(tokens).toEqual(['split']);
  } finally {
    mock.restore();
  }
});

test('executeStream buffered fallback: no token events, text on done with fallback=true', async () => {
  const doneFallback =
    'event: done\ndata: ' +
    JSON.stringify({
      type: 'done',
      traceId: 'trace-fb',
      mode: 'manual',
      providerUsed: 'gemini',
      modelUsed: 'gemini-2.5-flash',
      latencyMs: 900,
      fallback: true,
      partial: false,
      normalizedText: '{"result": 42}',
      structuredJson: { result: 42 },
    }) +
    '\n\n';
  const mock = installSseFetchMock([doneFallback]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    let tokenCount = 0;
    const response = await client.executeStream('u', 'p', () => {
      tokenCount += 1;
    });
    expect(tokenCount).toBe(0);
    expect(response.fallback).toBe(true);
    expect(response.structuredJson).toEqual({ result: 42 });
  } finally {
    mock.restore();
  }
});

test('executeStream throws AIValidationError on a SCHEMA_MISMATCH error event', async () => {
  const mock = installSseFetchMock([
    'event: status\ndata: {"type":"status","stage":"setup","message":"Preparing request..."}\n\n',
    'event: error\ndata: {"type":"error","traceId":"trace-e","errorCode":"SCHEMA_MISMATCH","error":"bad schema"}\n\n',
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() => client.executeStream('u', 'p', () => {}));
    expect(err).toBeInstanceOf(AIValidationError);
    expect((err as AIError).code).toBe('SCHEMA_MISMATCH');
    expect((err as AIError).traceId).toBe('trace-e');
  } finally {
    mock.restore();
  }
});

test('executeStream throws AIError on a generic error event', async () => {
  const mock = installSseFetchMock([
    'event: error\ndata: {"type":"error","traceId":"trace-x","errorCode":"STREAM_TIMEOUT","error":"stalled"}\n\n',
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() => client.executeStream('u', 'p', () => {}));
    expect(err).toBeInstanceOf(AIError);
    expect(err instanceof AIValidationError).toBe(false);
    expect((err as AIError).code).toBe('STREAM_TIMEOUT');
  } finally {
    mock.restore();
  }
});

test('executeStream maps a pre-stream HTTP failure to AIError', async () => {
  const mock = installSseFetchMock(
    [JSON.stringify({ errorCode: 'AI_UNAVAILABLE', detail: 'providers down', traceId: 'tr' })],
    503,
  );
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() => client.executeStream('u', 'p', () => {}));
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('AI_UNAVAILABLE');
    expect((err as AIError).status).toBe(503);
  } finally {
    mock.restore();
  }
});

test('executeStream throws when the stream ends without a terminal event', async () => {
  const mock = installSseFetchMock(['event: token\ndata: {"type":"token","text":"partial"}\n\n']);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() => client.executeStream('u', 'p', () => {}));
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe('STREAM_INCOMPLETE');
  } finally {
    mock.restore();
  }
});

test('executeStream raises AITimeoutError on inactivity', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Never enqueue; error the stream when the inactivity abort fires.
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            controller.error(err);
          });
        }
      },
    });
    return Promise.resolve(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
  }) as typeof globalThis.fetch;
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
      timeoutMs: 50,
    });
    const err = await captureRejection(() => client.executeStream('u', 'p', () => {}));
    expect(err).toBeInstanceOf(AITimeoutError);
    expect((err as AIError).code).toBe('TIMEOUT');
  } finally {
    globalThis.fetch = original;
  }
});

// ─────────────────────────────────────────────────────────────────
// executeStream request guard
//
// The runtime's streaming path never populates `proposedActions` /
// `toolCalls` (it runs tools with an empty catalog, and `SseDoneEvent` does
// not declare those fields). Such requests used to succeed and return a
// well-formed EMPTY response — silent data loss. They must now fail loudly,
// before any network call.
// ─────────────────────────────────────────────────────────────────

test("executeStream rejects expectedOutputType 'action' before any network call", async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.executeStream('crm.action', 'do it', () => {}, { expectedOutputType: 'action' }),
    );
    expect(err).toBeInstanceOf(Error);
    // Plain Error, NOT AIError — withFallback must not mask a wiring mistake.
    expect(err).not.toBeInstanceOf(AIError);
    expect((err as Error).message).toContain("expectedOutputType 'action' is not supported");
    expect((err as Error).message).toContain('executeWithTools');
    // Nothing was sent.
    expect(mock.calls.length).toBe(0);
  } finally {
    mock.restore();
  }
});

test('executeStream rejects a non-empty toolsAllowed before any network call', async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.executeStream('crm.action', 'do it', () => {}, {
        toolsAllowed: ['create_task'],
      }),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AIError);
    expect((err as Error).message).toContain('toolsAllowed is not supported');
    expect(mock.calls.length).toBe(0);
  } finally {
    mock.restore();
  }
});

test("executeStream rejects expectedOutputType 'workflow' before any network call", async () => {
  const mock = installFetchMock(() => ({ status: 200, body: successResponse() }));
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const err = await captureRejection(() =>
      client.executeStream('u', 'p', () => {}, { expectedOutputType: 'workflow' }),
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("expectedOutputType 'workflow' is not supported");
    expect(mock.calls.length).toBe(0);
  } finally {
    mock.restore();
  }
});

// The guard must NOT over-reach: structured JSON genuinely works on the
// streaming path (the runtime computes it and ships it on `done`).
test("executeStream still supports expectedOutputType 'json' with a responseSchema", async () => {
  const doneJson =
    'event: done\ndata: ' +
    JSON.stringify({
      type: 'done',
      traceId: 'trace-json',
      mode: 'manual',
      providerUsed: 'gemini',
      modelUsed: 'gemini-2.5-flash',
      latencyMs: 700,
      fallback: true,
      partial: false,
      normalizedText: '{"tier": "hot"}',
      structuredJson: { tier: 'hot' },
    }) +
    '\n\n';
  const mock = installSseFetchMock([doneJson]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    const response = await client.executeStream('lead.classify', 'classify', () => {}, {
      expectedOutputType: 'json',
      responseSchema: { type: 'object' },
    });
    expect(mock.calls.length).toBe(1);
    const body = JSON.parse(mock.calls[0]!.init.body as string);
    expect(body.expectedOutputType).toBe('json');
    expect(response.structuredJson).toEqual({ tier: 'hot' });
    expect(response.fallback).toBe(true);
  } finally {
    mock.restore();
  }
});

test('FallbackProxy.executeStream returns undefined and calls fn on error event', async () => {
  const mock = installSseFetchMock([
    'event: error\ndata: {"type":"error","traceId":"tr","errorCode":"AI_UNAVAILABLE","error":"down"}\n\n',
  ]);
  try {
    const client = new AIClient({
      baseUrl: 'https://ai.quikit.ai',
      getToken: () => 'tok',
      defaultAppId: 'crm',
    });
    let captured: AIError | undefined;
    const proxy = client.withFallback((err) => {
      captured = err;
    });
    const result = await proxy.executeStream('u', 'p', () => {});
    expect(result).toBeUndefined();
    expect(captured).toBeInstanceOf(AIError);
    expect(captured?.code).toBe('AI_UNAVAILABLE');
  } finally {
    mock.restore();
  }
});


// ═════════════════════════════════════════════════════════════════
// Agent gateway (P3-S167): invokeAgent / getAgentRun /
// waitForAgentRun / listAgents
// ═════════════════════════════════════════════════════════════════

import { AgentRunFailedError } from '../errors';


function agentClient(): AIClient {
  return new AIClient({
    baseUrl: 'https://ai.quikit.ai',
    getToken: () => 'test-jwt',
    defaultAppId: 'quikhrms',
  });
}


test('listAgents fetches /ai/agents with no auth header (public)', async () => {
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      agents: [
        {
          name: 'document_extract',
          displayName: 'Document Extract',
          description: 'desc',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          riskClass: 'read',
          version: '1.0.0',
        },
      ],
      total: 1,
    },
  }));
  try {
    const client = agentClient();
    const catalog = await client.listAgents();
    expect(mock.calls.length).toBe(1);
    const call = mock.calls[0]!;
    expect(call.url).toBe('https://ai.quikit.ai/ai/agents');
    expect(call.init.method).toBe('GET');
    // Public endpoint — the SDK MUST NOT send an authorization header.
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(catalog.length).toBe(1);
    expect(catalog[0]!.name).toBe('document_extract');
    expect(catalog[0]!.riskClass).toBe('read');
  } finally {
    mock.restore();
  }
});


test('invokeAgent posts camelCase body and returns {runId, status}', async () => {
  const mock = installFetchMock(() => ({
    status: 202,
    body: { runId: 'run_abc123', status: 'queued' },
  }));
  try {
    const client = agentClient();
    const result = await client.invokeAgent(
      'document_extract',
      { url: 'https://files.example.com/resume.pdf', schema_name: 'resume' },
      { appId: 'quikhrms', idempotencyKey: 'idem-1' },
    );
    expect(mock.calls.length).toBe(1);
    const call = mock.calls[0]!;
    expect(call.url).toBe('https://ai.quikit.ai/ai/agents/document_extract/invoke');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-jwt');
    const body = JSON.parse(call.init.body as string);
    expect(body.payload.url).toBe('https://files.example.com/resume.pdf');
    expect(body.payload.schema_name).toBe('resume');
    expect(body.appId).toBe('quikhrms');
    expect(body.idempotencyKey).toBe('idem-1');
    expect(result.runId).toBe('run_abc123');
    expect(result.status).toBe('queued');
  } finally {
    mock.restore();
  }
});


test('invokeAgent omits appId and idempotencyKey when not passed', async () => {
  const mock = installFetchMock(() => ({
    status: 202,
    body: { runId: 'run_xyz', status: 'queued' },
  }));
  try {
    const client = agentClient();
    await client.invokeAgent('research', { query: 'x' });
    const body = JSON.parse(mock.calls[0]!.init.body as string);
    expect(body.payload.query).toBe('x');
    expect('appId' in body).toBe(false);
    expect('idempotencyKey' in body).toBe(false);
  } finally {
    mock.restore();
  }
});


test('invokeAgent throws AIError on 404 (unknown or non-exposable agent)', async () => {
  const mock = installFetchMock(() => ({
    status: 404,
    body: { detail: 'agent not found' },
  }));
  try {
    const client = agentClient();
    const err = (await captureRejection(() =>
      client.invokeAgent('nonexistent', { q: 'x' }),
    )) as AIError;
    expect(err).toBeInstanceOf(AIError);
    expect(err.status).toBe(404);
  } finally {
    mock.restore();
  }
});


test('invokeAgent throws AIValidationError on 422', async () => {
  const mock = installFetchMock(() => ({
    status: 422,
    body: { detail: 'payload validation: url is required' },
  }));
  try {
    const client = agentClient();
    const err = (await captureRejection(() =>
      client.invokeAgent('document_extract', {}),
    )) as AIError;
    expect(err).toBeInstanceOf(AIValidationError);
    expect(err.status).toBe(422);
  } finally {
    mock.restore();
  }
});


test('getAgentRun fetches /ai/agents/runs/{id} and returns AgentRunResult', async () => {
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      runId: 'run_1',
      agentName: 'document_extract',
      status: 'completed',
      output: { fields: { name: 'Priya' } },
      error: null,
      startedAt: '2026-08-12T00:00:00Z',
      completedAt: '2026-08-12T00:00:05Z',
      createdAt: '2026-08-12T00:00:00Z',
    },
  }));
  try {
    const client = agentClient();
    const result = await client.getAgentRun('run_1');
    expect(mock.calls[0]!.url).toBe('https://ai.quikit.ai/ai/agents/runs/run_1');
    expect(mock.calls[0]!.init.method).toBe('GET');
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ fields: { name: 'Priya' } });
  } finally {
    mock.restore();
  }
});


test('getAgentRun throws AIError on 404 (unknown / cross-org / persona-kind)', async () => {
  const mock = installFetchMock(() => ({
    status: 404,
    body: { detail: 'run not found' },
  }));
  try {
    const client = agentClient();
    const err = (await captureRejection(() => client.getAgentRun('run_missing'))) as AIError;
    expect(err).toBeInstanceOf(AIError);
    expect(err.status).toBe(404);
  } finally {
    mock.restore();
  }
});


test('waitForAgentRun polls queued to running to completed and resolves', async () => {
  const responses: Array<{ status: number; body: unknown }> = [
    {
      status: 200,
      body: {
        runId: 'r',
        agentName: 'x',
        status: 'queued',
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: null,
      },
    },
    {
      status: 200,
      body: {
        runId: 'r',
        agentName: 'x',
        status: 'running',
        output: null,
        error: null,
        startedAt: 't',
        completedAt: null,
        createdAt: 't',
      },
    },
    {
      status: 200,
      body: {
        runId: 'r',
        agentName: 'x',
        status: 'completed',
        output: { ok: true },
        error: null,
        startedAt: 't',
        completedAt: 't2',
        createdAt: 't',
      },
    },
  ];
  const mock = installFetchMock(() => responses.shift()!);
  try {
    const client = agentClient();
    const result = await client.waitForAgentRun('r', {
      initialPollMs: 5,
      maxPollMs: 10,
      timeoutMs: 5_000,
    });
    expect(result.status).toBe('completed');
    expect(mock.calls.length).toBe(3);
    for (const call of mock.calls) {
      expect(call.url).toBe('https://ai.quikit.ai/ai/agents/runs/r');
    }
  } finally {
    mock.restore();
  }
});


test('waitForAgentRun rejects on failed with AgentRunFailedError carrying error message AND output', async () => {
  const failureOutput = {
    reason: 'no_extractable_text',
    next_action: 'use_rag',
    pages_analysed: 12,
  };
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      runId: 'r_fail',
      agentName: 'document_analysis',
      status: 'failed',
      output: failureOutput,
      error: 'pdf is scanned; no extractable text',
      startedAt: 't',
      completedAt: 't2',
      createdAt: 't',
    },
  }));
  try {
    const client = agentClient();
    const err = (await captureRejection(() =>
      client.waitForAgentRun('r_fail', { initialPollMs: 5, maxPollMs: 10, timeoutMs: 5_000 }),
    )) as AgentRunFailedError;
    expect(err).toBeInstanceOf(AgentRunFailedError);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe('AGENT_RUN_FAILED');
    expect(err.runId).toBe('r_fail');
    expect(err.message).toContain('pdf is scanned; no extractable text');
    // The load-bearing pin — .runOutput survives onto the error, so a
    // caller wrapping in withFallback that catches this can still act on
    // the structured detail (this is exactly why withFallback does NOT
    // swallow AgentRunFailedError — see the FallbackProxy test below).
    expect(err.runOutput).toEqual(failureOutput);
  } finally {
    mock.restore();
  }
});


test('waitForAgentRun throws AITimeoutError with helpful message on explicit timeout', async () => {
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      runId: 'r_forever',
      agentName: 'x',
      status: 'queued',
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: null,
    },
  }));
  try {
    const client = agentClient();
    const err = (await captureRejection(() =>
      client.waitForAgentRun('r_forever', { initialPollMs: 5, maxPollMs: 10, timeoutMs: 50 }),
    )) as AITimeoutError;
    expect(err).toBeInstanceOf(AITimeoutError);
    expect(err.message).toContain('50ms');
    expect(err.message).toContain('poll manually with getAgentRun');
  } finally {
    mock.restore();
  }
});


test('waitForAgentRun DEFAULT timeoutMs is >= 360000 (exceeds runtime 300s deadline)', async () => {
  // The runtime's per-run deadline is 300_000ms
  // (settings.agent_run_deadline_seconds = 300). The SDK's default MUST
  // exceed that or a caller with no explicit timeoutMs would give up on
  // runs the server is still legitimately executing.
  //
  // We can't wait 6 minutes; instead, monkey-patch Date.now to advance
  // past the default in one poll cycle, then read the value quoted in
  // the AITimeoutError message.
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      runId: 'r_default',
      agentName: 'x',
      status: 'queued',
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: null,
    },
  }));
  const originalNow = Date.now;
  let callCount = 0;
  Date.now = () => {
    // First call returns start time; every subsequent call jumps 1 hour
    // ahead so the remaining budget goes negative on the second check.
    callCount += 1;
    return callCount === 1 ? 1_000 : 1_000 + 3_600_000;
  };
  try {
    const client = agentClient();
    const err = (await captureRejection(() =>
      client.waitForAgentRun('r_default'), // NO opts — reach default 360_000ms
    )) as AITimeoutError;
    expect(err).toBeInstanceOf(AITimeoutError);
    // 360000ms is the default AND > 300000ms.
    expect(err.message).toContain('360000ms');
  } finally {
    Date.now = originalNow;
    mock.restore();
  }
});


test('waitForAgentRun poll spacing is exponential-then-cap', async () => {
  const start = Date.now();
  const intervals: number[] = [];
  let lastAt = start;
  const responses: Array<{ status: number; body: unknown }> = [
    { status: 200, body: { runId: 'r', agentName: 'x', status: 'queued', output: null, error: null, startedAt: null, completedAt: null, createdAt: null } },
    { status: 200, body: { runId: 'r', agentName: 'x', status: 'queued', output: null, error: null, startedAt: null, completedAt: null, createdAt: null } },
    { status: 200, body: { runId: 'r', agentName: 'x', status: 'queued', output: null, error: null, startedAt: null, completedAt: null, createdAt: null } },
    { status: 200, body: { runId: 'r', agentName: 'x', status: 'completed', output: {}, error: null, startedAt: 't', completedAt: 't2', createdAt: 't' } },
  ];
  const mock = installFetchMock(() => {
    const now = Date.now();
    intervals.push(now - lastAt);
    lastAt = now;
    return responses.shift()!;
  });
  try {
    const client = agentClient();
    await client.waitForAgentRun('r', {
      initialPollMs: 40,
      maxPollMs: 100,
      timeoutMs: 5_000,
    });
    // First poll fires immediately (interval ~0), then 40ms, 80ms, 100ms.
    expect(intervals.length).toBe(4);
    expect(intervals[1]!).toBeGreaterThanOrEqual(30);
    expect(intervals[2]!).toBeGreaterThanOrEqual(70);
    expect(intervals[3]!).toBeGreaterThanOrEqual(90);
    expect(intervals[3]!).toBeLessThanOrEqual(160);
  } finally {
    mock.restore();
  }
});


test('FallbackProxy.waitForAgentRun PROPAGATES AgentRunFailedError (does not swallow)', async () => {
  // The load-bearing correction: a failed run is a successful call to
  // the server and MUST NOT be swallowed by withFallback. Order matters
  // — AgentRunFailedError extends AIError, so the check must run FIRST.
  const mock = installFetchMock(() => ({
    status: 200,
    body: {
      runId: 'r_fail',
      agentName: 'x',
      status: 'failed',
      output: { reason: 'no_extractable_text' },
      error: 'scanned pdf',
      startedAt: 't',
      completedAt: 't2',
      createdAt: 't',
    },
  }));
  try {
    const client = agentClient();
    let fallbackCalled = false;
    const proxy = client.withFallback(() => {
      fallbackCalled = true;
    });
    const err = (await captureRejection(() =>
      proxy.waitForAgentRun('r_fail', { initialPollMs: 5, maxPollMs: 10, timeoutMs: 5_000 }),
    )) as AgentRunFailedError;
    expect(err).toBeInstanceOf(AgentRunFailedError);
    expect(err.runOutput).toEqual({ reason: 'no_extractable_text' });
    // CRITICAL: the fallback fn was NEVER called — the run's verdict is
    // preserved for the caller to handle.
    expect(fallbackCalled).toBe(false);
  } finally {
    mock.restore();
  }
});


test('FallbackProxy.waitForAgentRun DOES fall back on transport errors', async () => {
  const mock = installFetchMock(() => ({
    status: 503,
    body: { detail: 'runtime unreachable' },
  }));
  try {
    const client = agentClient();
    let captured: AIError | undefined;
    const proxy = client.withFallback((err) => {
      captured = err;
    });
    const result = await proxy.waitForAgentRun('r_x', {
      initialPollMs: 5,
      maxPollMs: 10,
      timeoutMs: 5_000,
    });
    expect(result).toBeUndefined();
    expect(captured).toBeInstanceOf(AIError);
    // Genuinely NOT AgentRunFailedError — this is transport.
    expect(captured).not.toBeInstanceOf(AgentRunFailedError);
    expect(captured?.status).toBe(503);
  } finally {
    mock.restore();
  }
});
