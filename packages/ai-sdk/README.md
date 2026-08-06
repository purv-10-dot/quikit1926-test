# @quikit/ai-sdk

TypeScript client for the QuikIT AI Runtime. Zero dependencies — uses `fetch` only.

> **This file documents the SDK's API surface only.** For how AI works on the
> platform — the two integration models, the P0 enabler checklist, per-app
> notes, and the FAQ — see
> [`docs/14-ai-integration-guide.md`](../../docs/14-ai-integration-guide.md).

**Never call an LLM provider SDK directly** (`@anthropic-ai/sdk`,
`@google/generative-ai`, `@openrouter/sdk`, …). Doing so bypasses audit, cost
tracking, budgets, prompt-injection sanitisation, PII stripping, and provider
fallback. See the root `CLAUDE.md`.

## Server-side only

`baseUrl` must come from `QUIKIT_AI_RUNTIME_URL` — **never** a `NEXT_PUBLIC_*`
var. Construct the client in a route handler, server action, or server
component; never in a `"use client"` file.

## Create a client

```ts
import { AIClient } from "@quikit/ai-sdk";

const ai = new AIClient({
  baseUrl: process.env.QUIKIT_AI_RUNTIME_URL!,
  getToken: async () => session.accessToken, // the user's own NextAuth token
  defaultAppId: "quikcrm",
  timeoutMs: 30_000,
});
```

`baseUrl` and `getToken` are required; the constructor throws without them.

## Methods

```ts
// Plain text
const summary = await ai.executeText("lead.summary", "Summarize this lead.", {
  contextData: leadData,
});

// Structured JSON — you supply the schema
type Classification = { tier: "hot" | "warm" | "cold"; reason: string };
const c = await ai.executeStructured<Classification>(
  "lead.classify",
  "Classify this lead.",
  {
    type: "object",
    properties: { tier: { type: "string" }, reason: { type: "string" } },
    required: ["tier", "reason"],
  },
  { contextData: leadData },
);

// Tool/action mode — the runtime may propose governed actions
const result = await ai.executeWithTools(
  "crm.action",
  "Create a follow-up task tomorrow.",
  ["create_task"],
);

// Streaming (SSE) — plain-text use cases only, see caveat below
const streamed = await ai.executeStream(
  "report.narrative",
  "Draft a summary.",
  (chunk) => appendToUi(chunk), // onToken, fires per chunk
  { contextData: reportData, onStatus: (stage, msg) => setStage(msg) },
);
```

Pass `useCase` on **every** call — it drives cost tracking, audit, routing, and
model selection.

### `executeStream` scope limit

Streaming is for **read-only text** use cases. `executeStream` throws
immediately (before any network call) if you pass
`expectedOutputType: "action" | "workflow"` or a non-empty `toolsAllowed`,
because the runtime's streaming path never populates `proposedActions` or
`toolCalls` — the response would come back well-formed and empty rather than
failing. Use `executeWithTools` for those.

`expectedOutputType: "json"` is permitted, but the runtime falls back to
buffered execution server-side: no `token` events fire and the full payload
arrives on the terminal `done` event with `fallback: true`.

Its `timeoutMs` is an **inactivity** timeout, not a whole-stream deadline — the
clock resets on every received event (including keepalive pings), so a long but
healthy generation is never aborted while a genuine stall still raises
`AITimeoutError`. The buffered `execute` path bounds the entire request instead.

## Graceful fallback (mandatory)

No AI feature ships without a working non-AI path. `withFallback` returns
`undefined` and runs your fallback instead of throwing on `AIError`:

```ts
const summary = await ai
  .withFallback((err) => showManualForm())
  .executeText("lead.summary", "...", { contextData: leadData });
// string | undefined — undefined means the fallback fired
```

It wraps all five methods. Non-`AIError` throws still propagate: a missing
`appId`, a `getToken` that throws, or an invalid `executeStream` shape are bugs
to fix, not outages to degrade around.

## Errors

`AIError` and its subclasses `AITimeoutError` and `AIValidationError` each carry
`code`, `traceId`, and `status`. Quote the `traceId` when asking the AI team to
trace a call.

A 2xx whose body is empty, truncated, or not a JSON object raises
`AIError` with code `MALFORMED_RESPONSE` rather than returning `undefined` —
that keeps `withFallback` able to catch it, so a malformed response degrades the
screen instead of throwing a raw `TypeError`.

## Testing (mandatory — never make real LLM calls in tests)

```ts
import { MockAI } from "@quikit/ai-sdk";

const mockAI = new MockAI({
  defaultText: "mock summary",
  responses: new Map([["lead.summary", { normalizedText: "Acme — hot lead." }]]),
});

// Inject in place of AIClient, then assert on what was asked
expect(mockAI.calls[0].useCase).toBe("lead.summary");
mockAI.reset(); // between tests
```

`MockAI implements AIClientLike`, so it is assignable wherever the real client
is. It reuses the real `FallbackProxy`, so `mockAI.withFallback(...)` degrades
exactly the way production does, and it rejects the same `executeStream` shapes.
Simulate an outage with `new MockAI({ simulateError: { code, message } })`.

## Development

```bash
npm run typecheck -w @quikit/ai-sdk
npm run test -w @quikit/ai-sdk
```
