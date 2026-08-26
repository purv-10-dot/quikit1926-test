# @quikit/ai-sdk

TypeScript SDK for the Quikverse AI Runtime.

## Requirements

- Uses `globalThis.fetch` only — no third-party HTTP dependencies at runtime
- `vitest` is the only devDependency beyond TypeScript itself

## Installation

```bash
# In-repo for now; copy or path-link from your kit's packages/ directory
npm install @quikit/ai-sdk
```

## Quick start

```ts
import { AIClient } from '@quikit/ai-sdk';

const ai = new AIClient({
  baseUrl: process.env.QUIKIT_AI_RUNTIME_URL!, // never NEXT_PUBLIC_* — see Server-side use
  getToken: async () => session.accessToken,
  defaultAppId: 'crm',
  timeoutMs: 30_000,
});

// Plain text
const summary = await ai.executeText(
  'lead.summary',
  'Summarize this lead: Acme Corp, contacted 3 times, no response.',
);

// Structured JSON
type Classification = { tier: 'hot' | 'warm' | 'cold'; reason: string };
const classification = await ai.executeStructured<Classification>(
  'lead.classify',
  'Classify this lead.',
  {
    type: 'object',
    properties: {
      tier: { type: 'string', enum: ['hot', 'warm', 'cold'] },
      reason: { type: 'string' },
    },
    required: ['tier', 'reason'],
  },
);

// Tool/action mode
const result = await ai.executeWithTools(
  'crm.action',
  'Create a follow-up task for tomorrow.',
  ['create_task'],
);
console.log(result.proposedActions);
```

## Server-side use

**Construct this client on the server only.** `getToken` returns a user bearer token, and the
runtime URL is operator configuration — neither belongs in a browser bundle. Source `baseUrl` from
`QUIKIT_AI_RUNTIME_URL` (or your app's server-side equivalent), never from a `NEXT_PUBLIC_*`
variable, since anything `NEXT_PUBLIC_*` is inlined into client JavaScript by design.

What the SDK actually enforces today, stated precisely:

- `AIClient` throws `AIClient: baseUrl is required` at construction when `baseUrl` is empty, and
  `AIClient: getToken must be a function` when `getToken` is missing.
- That is a **required-argument check, not a browser guard.** It behaves identically in Node and in
  the browser, and it does not read `QUIKIT_AI_RUNTIME_URL` itself — the caller passes the value in.
  It catches the common accident (a client component with no server env access constructs the client
  with `undefined` and fails loudly on the spot) but it is a **runtime** error, not a build-time
  guarantee, and it cannot stop a caller who hardcodes a URL or reads a `NEXT_PUBLIC_*` one.

There is no build-time `server-only` boundary on this package. The `server-only` pattern is already
used elsewhere in this repo — `ui/lib/runtime/` imports it at the top of each server module, so an
accidental client-component import fails the Next.js build — but this SDK does not currently adopt
it. Doing so is a **deferred, separate item**, not something this package solves today.

## Streaming

`executeStream` consumes the runtime's Server-Sent Events endpoint
(`POST /ai/execute/stream`), invoking `onToken` for each text chunk as the
LLM generates and resolving with the final assembled response.

```ts
const response = await ai.executeStream(
  'lead.summary',
  'Summarize this lead: Acme Corp, contacted 3 times, no response.',
  (chunk) => process.stdout.write(chunk), // called per text chunk
  {
    // optional: observe pipeline progress before the first token
    onStatus: (stage, message) => console.log(`[${stage}] ${message}`),
  },
);

// The full text is also on the resolved response (handy for caching):
console.log(response.normalizedText);
```

Notes:

- **Text and structured JSON only — tool-use is rejected, not degraded.**
  `expectedOutputType: 'json'` with a `responseSchema` is supported: the runtime
  computes it on a buffered-fallback branch, so `onToken` is never called and the
  payload arrives on the resolved response with `fallback: true`.
  `expectedOutputType: 'action'` or `'workflow'`, and any non-empty
  `toolsAllowed`, **throw before the request is sent.** The runtime's streaming
  path runs tools with an empty catalog and never populates `proposedActions` or
  `toolCalls`, so such a request would otherwise return a well-formed empty
  result — indistinguishable from "the AI proposed nothing". Use
  `executeWithTools` for tool-bearing requests. The streaming path also omits
  some of the buffered pipeline's post-processing, so prefer the buffered
  `execute*` methods for anything that proposes or performs writes.
- That guard throws a plain `Error`, not an `AIError` — it is a wiring mistake,
  not an outage, so `withFallback` deliberately does **not** swallow it.
  `MockAI.executeStream` applies the identical guard, so a component tested
  against the mock behaves the same against the real client.
- **Inactivity timeout.** Unlike the buffered methods (whose `timeoutMs`
  bounds the whole request), `executeStream` treats `timeoutMs` as an
  inactivity window: the clock resets on every received event, including the
  runtime's periodic keepalive pings, so a long-but-healthy generation is
  never cut off. A genuine stall still throws `AITimeoutError`.
- Errors surface exactly like the buffered path — a terminal `error` event or
  a pre-stream HTTP failure throws `AIError` / `AIValidationError`. Wrap with
  `withFallback(fn)` for graceful degradation (returns `undefined` on error).

## Error handling

All HTTP failures throw an `AIError` (or subclass) carrying `code`, `traceId`, and `status`:

```ts
import { AIClient, AIError, AITimeoutError, AIValidationError } from '@quikit/ai-sdk';

try {
  const text = await ai.executeText('lead.summary', '...');
} catch (err) {
  if (err instanceof AITimeoutError) {
    // request timed out
  } else if (err instanceof AIValidationError) {
    // 422 — schema/output validation failed
  } else if (err instanceof AIError) {
    console.error('AI failed:', err.code, err.traceId);
  }
}
```

## Graceful fallback

`withFallback(fn)` returns a proxy that calls `fn(err)` and returns `undefined` on `AIError` instead of throwing. Use this to fall back to a manual UI when AI is unavailable.

```ts
import { AIClient, AIError } from '@quikit/ai-sdk';

const ai = new AIClient({ /* ... */ });

const summary = await ai
  .withFallback((err?: AIError) => {
    showManualForm();
    if (err) console.warn('AI fell back:', err.code);
  })
  .executeText('lead.summary', '...');

// summary is `string | undefined` — `undefined` if the fallback fired
```

The `fn` parameter is optional; both signatures work:

```ts
ai.withFallback(() => showManualForm()).execute({ ... });
ai.withFallback((err) => log(err?.code)).execute({ ... });
```

## Testing with MockAI

`MockAI` implements `AIClientLike` — the interface `AIClient` also implements — covering
`execute`, `executeText`, `executeStructured`, `executeWithTools`, `executeStream`, and
`withFallback`. Both classes declare `implements AIClientLike`, so `npm run typecheck` fails if
either drifts from the other. You can therefore type your component against the interface and pass
either one:

```ts
import type { AIClientLike } from '@quikit/ai-sdk';

async function summarizeLead(ai: AIClientLike, prompt: string) {
  return ai.withFallback(() => showManualForm()).executeText('lead.summary', prompt);
}
```

`MockAI.withFallback` reuses the real `FallbackProxy`, so a `simulateError`-configured mock degrades
through exactly the same code path as a live outage — which is what makes the mandatory
`withFallback` pattern testable against the mandatory test double.

What `MockAI` is **not**: a full `AIClient` substitute. It takes a different constructor config
(`MockConfig`, not `AIClientConfig` — no `baseUrl`, `getToken`, or `timeoutMs`), issues no HTTP
requests, and its `simulateLatencyMs` is a plain sleep rather than a real timeout, so it cannot
raise `AITimeoutError`. Use it for the request/response surface, not for transport behaviour.

Pass it to your component under test in place of the real client.

```ts
import { MockAI } from '@quikit/ai-sdk';

const mockAI = new MockAI({
  defaultText: 'mock summary',
  responses: new Map([
    ['lead.summary', { normalizedText: 'Acme Corp — hot lead, call today.' }],
  ]),
});

// Inject mockAI into the component...
await yourComponent.run(mockAI);

// Assert what was asked
expect(mockAI.calls.length).toBe(1);
expect(mockAI.calls[0].useCase).toBe('lead.summary');

mockAI.reset(); // clear call log between tests
```

Simulate errors:

```ts
const mockAI = new MockAI({
  simulateError: { code: 'AI_UNAVAILABLE', message: 'providers down' },
});
// All calls now throw AIError with the configured code
```

## API

- `AIClient` — canonical class
- `QuikitAI` — alias for `AIClient` (equivalent)
- `MockAI` — test double for the `AIClientLike` surface
- `AIClientLike` — the interface both classes implement; type your components against this
- `AIFallbackLike` — what `withFallback` returns (same methods, each widened to `| undefined`)
- `FallbackProxy` — the concrete `AIFallbackLike` implementation, shared by both classes
- `AIError`, `AITimeoutError`, `AIValidationError` — error types

### Error codes

| Code | Raised when |
|---|---|
| `TIMEOUT` | request (or stream inactivity) exceeded `timeoutMs` — as `AITimeoutError` |
| `VALIDATION_ERROR`, `SCHEMA_MISMATCH` | HTTP 422 or matching `errorCode` — as `AIValidationError` |
| `NETWORK_ERROR` | `fetch` rejected, or the stream body was missing/unreadable |
| `MALFORMED_RESPONSE` | a 2xx whose body was empty, not valid JSON, or not a JSON object |
| `STREAM_INCOMPLETE` | a stream ended without a terminal `done` or `error` event |
| `HTTP_<status>` | an HTTP failure the runtime sent without an `errorCode` |

Every one of these is an `AIError`, so `withFallback` degrades on all of them.

## Development

```bash
npm test         # Run tests via Vitest
npm run typecheck
```
