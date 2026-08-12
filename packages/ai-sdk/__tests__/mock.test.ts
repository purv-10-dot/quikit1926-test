import { expect, test } from 'vitest';
import { AIClient } from '../lib/client';
import { MockAI } from '../lib/mock';
import { AIError } from '../lib/errors';
import type { AIClientLike, AIStreamOptions } from '../lib/types';

test('MockAI.execute returns default text response', async () => {
  const ai = new MockAI({ defaultText: 'mocked' });
  const response = await ai.execute({
    appId: 'crm',
    useCase: 'lead.summary',
    userPrompt: 'summarize',
    expectedOutputType: 'text',
  });
  expect(response.normalizedText).toBe('mocked');
  expect(response.mode).toBe('manual');
  expect(response.traceId.startsWith('mock-trace-')).toBe(true);
});

test('MockAI.execute returns useCase-keyed override', async () => {
  const ai = new MockAI({
    defaultText: 'default',
    responses: new Map([
      ['lead.summary', { normalizedText: 'Acme Corp — hot lead' }],
    ]),
  });
  const response = await ai.execute({
    appId: 'crm',
    useCase: 'lead.summary',
    userPrompt: 'summarize',
    expectedOutputType: 'text',
  });
  expect(response.normalizedText).toBe('Acme Corp — hot lead');
});

test('MockAI.executeStructured returns defaultStructured', async () => {
  const ai = new MockAI({ defaultStructured: { score: 7 } });
  const result = await ai.executeStructured<{ score: number }>(
    'classify',
    'classify this',
    { type: 'object' },
  );
  expect(result.score).toBe(7);
});

test('MockAI.calls tracks invocations', async () => {
  const ai = new MockAI();
  await ai.executeText('use1', 'prompt1');
  await ai.executeText('use2', 'prompt2');
  expect(ai.calls.length).toBe(2);
  expect(ai.calls[0]!.useCase).toBe('use1');
  expect(ai.calls[0]!.userPrompt).toBe('prompt1');
  expect(ai.calls[1]!.useCase).toBe('use2');
});

test('MockAI.reset clears calls', async () => {
  const ai = new MockAI();
  await ai.executeText('u', 'p');
  expect(ai.calls.length).toBe(1);
  ai.reset();
  expect(ai.calls.length).toBe(0);
});

test('MockAI.simulateError throws AIError', async () => {
  const ai = new MockAI({
    simulateError: { code: 'PROVIDER_ERROR', message: 'simulated' },
  });
  let captured: unknown;
  try {
    await ai.execute({
      appId: 'crm',
      useCase: 'x',
      userPrompt: 'y',
      expectedOutputType: 'text',
    });
  } catch (err) {
    captured = err;
  }
  expect(captured).toBeInstanceOf(AIError);
  expect((captured as AIError).code).toBe('PROVIDER_ERROR');
});

test('MockAI.executeWithTools returns proposedActions array', async () => {
  const ai = new MockAI({
    responses: new Map([
      [
        'crm.action',
        {
          proposedActions: [
            {
              toolName: 'create_task',
              inputPayload: { title: 'follow up' },
              description: 'create follow-up task',
              estimatedEffect: 'creates a task',
              permissionDenied: false,
            },
          ],
        },
      ],
    ]),
  });
  const response = await ai.executeWithTools('crm.action', 'do it', ['create_task']);
  expect(response.proposedActions?.length).toBe(1);
  expect(response.proposedActions?.[0]?.toolName).toBe('create_task');
});

test('MockAI.executeStream emits defaultText in chunks and resolves with full text', async () => {
  const ai = new MockAI({ defaultText: 'streamed response' });
  const tokens: string[] = [];
  const statuses: Array<[string, string]> = [];
  const response = await ai.executeStream('u', 'p', (c) => tokens.push(c), {
    onStatus: (stage, message) => statuses.push([stage, message]),
  });
  // Chunks reassemble to the full text, and more than one chunk was emitted.
  expect(tokens.join('')).toBe('streamed response');
  expect(tokens.length).toBeGreaterThan(1);
  expect(response.normalizedText).toBe('streamed response');
  expect(response.fallback).toBe(false);
  expect(response.partial).toBe(false);
  expect(statuses.length).toBe(1);
  expect(statuses[0]![0]).toBe('llm_call');
});

test('MockAI.executeStream records the call in calls', async () => {
  const ai = new MockAI();
  await ai.executeStream('stream.uc', 'prompt', () => {});
  expect(ai.calls.length).toBe(1);
  expect(ai.calls[0]!.useCase).toBe('stream.uc');
  expect(ai.calls[0]!.request.expectedOutputType).toBe('text');
});

test('MockAI.executeStream honours useCase override text', async () => {
  const ai = new MockAI({
    defaultText: 'default',
    responses: new Map([['lead.summary', { normalizedText: 'Acme — hot' }]]),
  });
  const tokens: string[] = [];
  const response = await ai.executeStream('lead.summary', 'p', (c) => tokens.push(c));
  expect(tokens.join('')).toBe('Acme — hot');
  expect(response.normalizedText).toBe('Acme — hot');
});

test('MockAI.executeStream throws AIError when simulateError is set', async () => {
  const ai = new MockAI({ simulateError: { code: 'PROVIDER_ERROR', message: 'simulated' } });
  let captured: unknown;
  try {
    await ai.executeStream('x', 'y', () => {});
  } catch (err) {
    captured = err;
  }
  expect(captured).toBeInstanceOf(AIError);
  expect((captured as AIError).code).toBe('PROVIDER_ERROR');
});

test('MockAI.calls returns a copy (cannot mutate internal state)', async () => {
  const ai = new MockAI();
  await ai.executeText('u', 'p');
  const calls = ai.calls;
  calls.push({
    useCase: 'fake',
    userPrompt: 'fake',
    appId: '',
    request: {
      appId: '',
      useCase: 'fake',
      userPrompt: 'fake',
      expectedOutputType: 'text',
    },
    timestamp: 0,
  });
  expect(ai.calls.length).toBe(1);
});

// ─────────────────────────────────────────────────────────────────
// Parity with AIClient
//
// The SDK mandates `withFallback` on every AI screen and `MockAI` in every
// test. Before `AIClientLike`, those two rules contradicted each other: the
// mock had no `withFallback`, so the mandated pattern could not be exercised
// against the mandated test double.
// ─────────────────────────────────────────────────────────────────

test('MockAI is assignable to AIClientLike', async () => {
  // The assignment itself is the assertion — this fails to compile (and
  // `npm run typecheck` fails) if MockAI drifts from the shared surface.
  const ai: AIClientLike = new MockAI({ defaultText: 'via the interface' });
  const text = await ai.executeText('lead.summary', 'summarize');
  expect(text).toBe('via the interface');
  expect(typeof ai.withFallback).toBe('function');
});

test('MockAI.withFallback degrades on a simulated AIError like the real client', async () => {
  const ai = new MockAI({
    simulateError: { code: 'AI_UNAVAILABLE', message: 'providers down' },
  });
  let captured: AIError | undefined;
  const result = await ai
    .withFallback((err) => {
      captured = err;
    })
    .executeText('lead.summary', 'summarize');
  expect(result).toBeUndefined();
  expect(captured).toBeInstanceOf(AIError);
  expect(captured?.code).toBe('AI_UNAVAILABLE');
});

test('MockAI.executeStream rejects the same shapes AIClient does, identically', async () => {
  // If these two ever diverge, a component tested against the mock would pass
  // and then throw against the real client — exactly the trap AIClientLike
  // exists to close, and one the type system cannot catch on its own.
  const rejected: AIStreamOptions[] = [
    { expectedOutputType: 'action' },
    { expectedOutputType: 'workflow' },
    { toolsAllowed: ['create_task'] },
  ];

  const client = new AIClient({
    baseUrl: 'https://ai.quikit.ai',
    getToken: () => 'tok',
    defaultAppId: 'crm',
  });

  for (const options of rejected) {
    const mockAI = new MockAI();
    let realMessage: string | undefined;
    let mockMessage: string | undefined;
    try {
      await client.executeStream('u', 'p', () => {}, options);
    } catch (err) {
      realMessage = (err as Error).message;
    }
    try {
      await mockAI.executeStream('u', 'p', () => {}, options);
    } catch (err) {
      mockMessage = (err as Error).message;
    }
    expect(realMessage).toBeDefined();
    expect(mockMessage).toBe(realMessage);
    // A request the real client would never send must not be recorded.
    expect(mockAI.calls.length).toBe(0);
  }
});

test("MockAI.executeStream still accepts 'json' and text, like AIClient", async () => {
  const ai = new MockAI({ defaultText: 'ok' });
  await ai.executeStream('u', 'p', () => {}, { expectedOutputType: 'json' });
  await ai.executeStream('u', 'p', () => {});
  expect(ai.calls.length).toBe(2);
});

test('MockAI.withFallback passes values through when the call succeeds', async () => {
  const ai = new MockAI({ defaultText: 'mock summary' });
  let fallbackFired = false;
  const proxy = ai.withFallback(() => {
    fallbackFired = true;
  });
  const text = await proxy.executeText('lead.summary', 'summarize');
  const structured = await proxy.executeStructured<{ ok?: boolean }>('c', 'p', { type: 'object' });
  expect(text).toBe('mock summary');
  expect(structured).toEqual({});
  expect(fallbackFired).toBe(false);
  expect(ai.calls.length).toBe(2);
});
