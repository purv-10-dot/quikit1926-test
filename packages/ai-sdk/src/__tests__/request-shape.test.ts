/**
 * S177 — the request body's key set, checked against the RUNTIME's contract.
 *
 * Two bugs shipped in v0.2.0 and both were the same class: a field name in
 * this SDK that `POST /ai/execute` does not recognise.
 *
 *   1. `entityId` / `entityType` were MISSING, so no app on the SDK could send
 *      entity routing. The runtime then resolved a module (whose `can_handle`
 *      is vacuously true with `entity_type=None`), ran the LLM, and returned
 *      200 with the module named in the trace — but the module never loaded
 *      the record's context. A silent quality loss with no error anywhere.
 *   2. `model` was sent where the runtime expects `modelPreference`. Because
 *      `ExecuteRequest` sets `extra="forbid"`, that is a 422 on the WHOLE
 *      request — it never bit only because nothing passed a model override.
 *
 * **Why the guard below is written against a hardcoded set rather than the
 * SDK's own types:** a test that checks the SDK against itself is exactly how
 * both bugs survived. `AIExecuteRequest` was self-consistent and wrong. The
 * only useful assertion compares the serialised body to what the SERVER
 * accepts, so the fixture names its source and instructs the reader to re-read
 * it rather than edit the list to go green.
 */
import { expect, test } from 'vitest';
import { AIClient } from '../client';
import { MockAI } from '../mock';
import type { AIExecuteResponse } from '../types';

// ─────────────────────────────────────────────────────────────────
// The runtime's accepted key set.
//
// SOURCE OF TRUTH: runtime `app/schemas/execute.py::ExecuteRequest`.
// These are its camelCase aliases. That model sets `extra="forbid"`, so ANY
// key outside this set fails the whole request with a 422 — which is how
// `model` (vs `modelPreference`) shipped broken in v0.2.0.
//
// ⚠ WHEN THIS TEST FAILS: re-read `app/schemas/execute.py`. Do NOT add a key
// here to make it pass — that inverts the direction of trust and turns this
// guard back into the self-consistency check that missed both bugs.
//
// Note: the runtime ALSO accepts the snake_case field names
// (`populate_by_name=True`), but this SDK only ever emits camelCase. A
// snake_case key appearing in a body would be an SDK bug even though the
// server would take it — so the alias set is the right thing to assert.
// ─────────────────────────────────────────────────────────────────
const RUNTIME_ACCEPTED_KEYS: ReadonlySet<string> = new Set([
  'appId',
  'useCase',
  'traceId',
  'systemPrompt',
  'userPrompt',
  'expectedOutputType',
  'contextData',
  'entityId',
  'entityType',
  'responseSchema',
  'sessionId',
  'mode',
  'modelPreference',
  'temperature',
  'maxOutputTokens',
  'async',
  'callbackUrl',
  'toolsAllowed',
  'dryRun',
]);

interface FetchCall {
  url: string;
  init: RequestInit;
}

function installFetchMock(body: unknown): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === 'string' ? input : input.toString(), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status: 200,
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

function installSseFetchMock(chunks: string[]): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === 'string' ? input : input.toString(), init: init ?? {} });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
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

function successResponse(): AIExecuteResponse {
  return { mode: 'manual', traceId: 'trace-177', normalizedText: 'ok', structuredJson: { ok: true } };
}

const DONE_EVENT =
  'event: done\ndata: ' +
  JSON.stringify({ type: 'done', traceId: 'trace-177', mode: 'manual', normalizedText: 'ok' }) +
  '\n\n';

function client(): AIClient {
  return new AIClient({ baseUrl: 'https://ai.example.test', getToken: () => 'tok' });
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Bug 1 — entity routing reaches the wire
// ─────────────────────────────────────────────────────────────────

test('entityId and entityType serialise into the request body', async () => {
  const mock = installFetchMock(successResponse());
  try {
    await client().execute({
      appId: 'quikscale',
      useCase: 'kpi.explain',
      userPrompt: 'why is this KPI at risk?',
      expectedOutputType: 'text',
      entityId: 'kpi_42',
      entityType: 'kpi',
    });
    const body = bodyOf(mock.calls[0]!);
    expect(body.entityId).toBe('kpi_42');
    expect(body.entityType).toBe('kpi');
  } finally {
    mock.restore();
  }
});

test('entity routing passes through the executeText/executeStructured options bag', async () => {
  const mock = installFetchMock(successResponse());
  try {
    await client().executeText('kpi.explain', 'why?', {
      appId: 'quikscale',
      entityId: 'kpi_7',
      entityType: 'kpi',
    });
    await client().executeStructured(
      'kpi.classify',
      'classify',
      { type: 'object' },
      { appId: 'quikscale', entityId: 'kpi_8', entityType: 'kpi' },
    );
    expect(bodyOf(mock.calls[0]!).entityId).toBe('kpi_7');
    expect(bodyOf(mock.calls[1]!).entityId).toBe('kpi_8');
  } finally {
    mock.restore();
  }
});

test('entity routing reaches the streaming endpoint too', async () => {
  const mock = installSseFetchMock([DONE_EVENT]);
  try {
    await client().executeStream('report.narrative', 'draft', () => {}, {
      appId: 'quikscale',
      entityId: 'rock_3',
      entityType: 'rock',
    });
    const body = bodyOf(mock.calls[0]!);
    expect(body.entityId).toBe('rock_3');
    expect(body.entityType).toBe('rock');
  } finally {
    mock.restore();
  }
});

test('omitted optional fields produce no keys on the wire', async () => {
  // `JSON.stringify` drops `undefined`-valued keys, so this is a property of
  // the verbatim pass-through rather than something the client special-cases.
  // Pinned because the runtime forbids unknown keys — an explicit
  // `"entityId": null` would be accepted, but `undefined` must not become one.
  const mock = installFetchMock(successResponse());
  try {
    await client().execute({
      appId: 'quikcrm',
      useCase: 'lead.summary',
      userPrompt: 'summarize',
      expectedOutputType: 'text',
    });
    const body = bodyOf(mock.calls[0]!);
    expect('entityId' in body).toBe(false);
    expect('entityType' in body).toBe(false);
    expect('modelPreference' in body).toBe(false);
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────
// Bug 2 — the model override's field name
// ─────────────────────────────────────────────────────────────────

test('modelPreference serialises under exactly that name, and never as model', async () => {
  const mock = installFetchMock(successResponse());
  try {
    await client().execute({
      appId: 'quikcrm',
      useCase: 'lead.summary',
      userPrompt: 'summarize',
      expectedOutputType: 'text',
      modelPreference: 'gemini-2.5-pro',
    });
    const body = bodyOf(mock.calls[0]!);
    expect(body.modelPreference).toBe('gemini-2.5-pro');
    // The v0.2.0 spelling must not reappear under any code path — it is a 422.
    expect('model' in body).toBe(false);
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────
// The guard that would have caught both
// ─────────────────────────────────────────────────────────────────

test('every body-building entry point emits only keys the runtime accepts', async () => {
  // All five entry points construct `finalRequest` INDEPENDENTLY, so each is
  // its own opportunity for the v0.2.0 bug to recur. Every field the
  // interface offers is populated here — an unrecognised key can only be
  // caught if something actually sends it.
  const everyField = {
    appId: 'quikscale',
    systemPrompt: 'ignored by the runtime but still accepted',
    contextData: { a: 1 },
    entityId: 'kpi_1',
    entityType: 'kpi',
    modelPreference: 'gemini-2.5-flash',
    temperature: 0.2,
    maxOutputTokens: 512,
    sessionId: 'sess-1',
  };

  const buffered = installFetchMock(successResponse());
  try {
    const c = client();
    await c.execute({
      useCase: 'a.b',
      userPrompt: 'p',
      expectedOutputType: 'text',
      ...everyField,
    });
    await c.executeText('a.b', 'p', everyField);
    await c.executeStructured('a.b', 'p', { type: 'object' }, everyField);
    await c.executeWithTools('a.b', 'p', ['fetch_kpi'], everyField);
    expect(buffered.calls).toHaveLength(4);
    for (const call of buffered.calls) {
      const unknownKeys = Object.keys(bodyOf(call)).filter((k) => !RUNTIME_ACCEPTED_KEYS.has(k));
      expect(unknownKeys).toEqual([]);
    }
  } finally {
    buffered.restore();
  }

  // `executeStream` builds its own body and strips `onStatus` before sending;
  // that strip is itself a key-set concern, so it belongs in this guard.
  const streamed = installSseFetchMock([DONE_EVENT]);
  try {
    await client().executeStream('a.b', 'p', () => {}, { ...everyField, onStatus: () => {} });
    const unknownKeys = Object.keys(bodyOf(streamed.calls[0]!)).filter(
      (k) => !RUNTIME_ACCEPTED_KEYS.has(k),
    );
    expect(unknownKeys).toEqual([]);
  } finally {
    streamed.restore();
  }
});

test('onStatus never reaches the wire', async () => {
  // A stream-only callback on the same options object as request fields. It
  // is destructured out in `executeStream`; if that ever regresses, the
  // runtime 422s the whole call on an unknown key.
  const mock = installSseFetchMock([DONE_EVENT]);
  try {
    await client().executeStream('a.b', 'p', () => {}, {
      appId: 'quikscale',
      onStatus: () => {},
    });
    expect('onStatus' in bodyOf(mock.calls[0]!)).toBe(false);
  } finally {
    mock.restore();
  }
});

// ─────────────────────────────────────────────────────────────────
// MockAI parity — app tests must be able to assert on the new fields
// ─────────────────────────────────────────────────────────────────

test('MockAI records entity routing and modelPreference in calls', async () => {
  // No change was needed in `mock.ts` for this — `execute` records the whole
  // request object. The test pins that, so a future refactor to field-by-field
  // recording can't silently drop the new fields and leave app tests unable
  // to assert the thing this session exists to enable.
  const ai = new MockAI({ defaultText: 'mock' });
  await ai.executeText('kpi.explain', 'why?', {
    appId: 'quikscale',
    entityId: 'kpi_99',
    entityType: 'kpi',
    modelPreference: 'gemini-2.5-pro',
  });
  const recorded = ai.calls[0]!.request;
  expect(recorded.entityId).toBe('kpi_99');
  expect(recorded.entityType).toBe('kpi');
  expect(recorded.modelPreference).toBe('gemini-2.5-pro');
});
