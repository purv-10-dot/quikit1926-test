# Adding AI to Your QuikIT App — App Owner Guide

**Audience:** App owners / developers integrating AI into a QuikIT Next.js app.

**What you get from this doc:** how AI works on QuikIT, the two integration
models, exactly what your app must provide, the correct way to use the SDK, and
answers to the questions everyone asks.

**Status:** SDK verified against `packages/ai-sdk` at the commit that introduced
it. Per-app notes in §11 were supplied by the AI Runtime team (verified
2026-07-02) and should be re-confirmed against the repo before you rely on them.

> One line to remember: **your app is a caller, not a brain.** The intelligence
> lives in the AI Runtime. Your app's job is to (1) let the runtime read your
> data safely when needed, (2) call the runtime for AI answers, and (3) show
> those answers with a working fallback when AI is down.

---

## 1. How AI works here (and what NOT to do)

There is one shared **AI Runtime** service. Your app never calls
Gemini/OpenAI/Anthropic directly — you call the runtime through
`@quikit/ai-sdk`, and it handles prompt assembly, provider selection +
fallback, safety (prompt-injection guardrails, PII redaction), permission
checks, cost tracking, and full audit for you.

**Forbidden:** importing `@anthropic-ai/sdk`, `@google/generative-ai`,
`@openrouter/sdk`, or any LLM SDK directly in your app. Doing so bypasses audit,
cost control, budgets, injection sanitisation, PII stripping, provider fallback,
and central model control — and each app then drifts. This rule is in the root
`CLAUDE.md`; this guide is how you follow it.

---

## 2. The two models

AI features come in two shapes. **Which one applies depends on the feature**, and
most apps will ship both over time. You cannot ship a cross-app feature with only
Model A plumbing, and you should not burden a single-app feature with Model B
plumbing.

### Model A — In-app features (app-orchestrated)

Your app already has the data. You fetch it locally, build the request, and call
the runtime **once** as a governed LLM. Example: "AI KPI" — QuikScale gathers its
own KPI/OPSP data, sends it with a prompt, gets a result back.

- **One network hop.** Lowest latency.
- **You do all the work, in your own codebase** — but it's little work: SDK call
  + fallback + tests.
- **No P0 enablers needed** (the runtime never calls back into your app).
- You still get the full safety/governance/audit stack — Model A is *not* "just
  an LLM."

### Model B — Inter-app features (runtime-orchestrated)

The feature needs data your app doesn't hold (other apps), or needs the AI to
**take an action** (create/update records with approval). Your app calls one thin
`use_case`; the runtime fetches across apps, reasons, and can write back.
Example: a CEO briefing that reads QuikScale + CRM + HRMS.

- **Multiple hops** (the runtime calls your API — and other apps' APIs — for
  context).
- **Split work:** you build the P0 enablers (§5) and a compatibility doc; the
  **AI team** builds the runtime-side module.
- Higher latency and coordination, but it's the only way to do cross-app
  reasoning or governed AI writes.

### How to decide

- **Does one app (yours) already hold all the data, and does it only need to
  read/generate?** → **Model A.**
- **Does it need other apps' data, or must the AI create/update records?** →
  **Model B.**
- **Is it a general capability (research, summarise a document, generate a
  document, translate, chart data)?** → **Cross-cutting agent** (§6) — rides
  Model A's transport, usable today with no enablers.

---

## 3. The SDK — correct integration

The SDK is **generic and identical for every app.** App-specific behaviour lives
in the runtime (via `use_case` strings and, for Model B, a runtime module) —
never in a per-app SDK fork.

Full API reference: [`packages/ai-sdk/README.md`](../packages/ai-sdk/README.md).
This section covers integration; that file covers the surface.

### 3.1 Install

`@quikit/ai-sdk` is a workspace package in `packages/ai-sdk`. Zero runtime
dependencies (uses `fetch` only). No special Node version required; tests run on
Vitest like every other workspace.

1. Add it to your app's `package.json`, the same way you'd add any `@quikit/*`
   package:
   ```json
   "dependencies": { "@quikit/ai-sdk": "*" }
   ```
2. Add it to `transpilePackages` in your app's `next.config.js`, alongside the
   other `@quikit/*` entries. **This step is easy to miss and produces a
   confusing build error if you skip it.**
3. `npm install` from the repo root.

### 3.2 Server-side only

`baseUrl` must come from `QUIKIT_AI_RUNTIME_URL` — **never** a `NEXT_PUBLIC_*`
var. Construct the client in a route handler, server action, or server component;
never in a `"use client"` file. There is no service secret in this package (auth
is the user's own token, see §3.3), but the runtime URL is not public and the
client is not built for browser use.

### 3.3 Create the client (once per request context)

```ts
import { AIClient } from "@quikit/ai-sdk";

const ai = new AIClient({
  baseUrl: process.env.QUIKIT_AI_RUNTIME_URL!,
  getToken: async () => session.accessToken, // the user's own NextAuth token
  defaultAppId: "yourappslug",               // e.g. "quikcrm"
  timeoutMs: 30_000,
});
```

`baseUrl` and `getToken` are required — the constructor throws without them.
Model A uses **the user's existing NextAuth token**; no new credential.

### 3.4 Call it — four methods

```ts
// Plain text
const summary = await ai.executeText(
  "lead.summary",                    // use_case: dotted "entity.action"
  "Summarize this lead.",
  { contextData: leadData },         // YOUR assembled data (Model A)
);

// Structured JSON (you supply the JSON schema)
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

// Tool/action mode (Model B — the runtime may propose governed actions)
const result = await ai.executeWithTools(
  "crm.action",
  "Create a follow-up task tomorrow.",
  ["create_task"],
);

// Streaming (SSE) — plain-text use cases only, see §8
const streamed = await ai.executeStream(
  "report.narrative",
  "Draft a summary.",
  (chunk) => appendToUi(chunk),      // onToken, fires per chunk
  { contextData: reportData, onStatus: (stage, msg) => setStage(msg) },
);
```

The request supports: `appId`, `useCase`, `userPrompt`, `expectedOutputType`,
`responseSchema`, `contextData`, `systemPrompt`, `model`, `temperature`,
`maxOutputTokens`, `toolsAllowed`, `sessionId`. The response carries
`normalizedText`, `structuredJson`, `proposedActions`, `traceId`, `mode`,
token/cost/latency fields, and `gracefulFallback`.

### 3.5 Mandatory: graceful fallback on every AI screen

No AI feature ships without a working non-AI path. `withFallback` returns
`undefined` (and runs your fallback) instead of throwing when AI is unavailable:

```ts
const summary = await ai
  .withFallback((err) => showManualForm())
  .executeText("lead.summary", "...", { contextData: leadData });
// string | undefined — undefined means the fallback fired
```

It wraps all four methods. **Non-`AIError` throws still propagate** — a missing
`appId`, a `getToken` that itself throws, or an invalid `executeStream` shape are
bugs to fix, not outages to degrade around. Do not wrap those away.

A 2xx whose body is empty, truncated, or not a JSON object raises `AIError` with
code `MALFORMED_RESPONSE`, so a malformed response degrades the screen through
your fallback rather than throwing a raw `TypeError` past it.

### 3.6 Mandatory: MockAI in tests (never real LLM calls in tests)

```ts
import { MockAI } from "@quikit/ai-sdk";

const mockAI = new MockAI({
  defaultText: "mock summary",
  responses: new Map([["lead.summary", { normalizedText: "Acme — hot lead." }]]),
});
// inject in place of AIClient; assert on mockAI.calls; mockAI.reset() between tests
```

`MockAI implements AIClientLike`, so it is assignable wherever the real client is
— type it as `AIClientLike` in your component's props rather than `AIClient`. It
reuses the real `FallbackProxy`, so `mockAI.withFallback(...)` degrades exactly
the way production does, and it rejects the same `executeStream` shapes.

Test both paths: success, and failure via
`new MockAI({ simulateError: { code, message } })`.

Error handling uses `AIError` / `AITimeoutError` / `AIValidationError` (each
carries `code`, `traceId`, `status`).

### 3.7 Hard rules

- Never call an LLM provider SDK directly (§1).
- Pass `useCase` on **every** call — it drives cost tracking, audit, routing, and
  model selection (§8).
- Implement `withFallback` on every AI screen; test both success and failure.
- Never fork the SDK. Special needs are met by a runtime module, new summary
  endpoints, or `AIClient` config — escalate to the AI team.

---

## 4. What your app must provide — overview

| Feature shape | What your app must build |
|---|---|
| **Model A** (in-app) | SDK integration + `withFallback` + `MockAI` tests. Assemble your own context. |
| **Cross-cutting agent** (research/doc/translate/chart) | Same as Model A. No enablers. |
| **Model B** (inter-app / AI writes) | The P0 enablers (§5) + a compatibility doc. |
| **Search** | Feed your entities to the search index (§7). |

---

## 5. Per-app AI requirements for Model B (the checklist)

These exist because in Model B the **runtime calls your API as a service** to
fetch context and (optionally) act.

1. **Service-JWT authentication.** Your auth wrapper must accept a service token
   (Bearer) that carries `actingAs = "ai_agent"` + `actingAgentId`, and resolve
   it to an org context. Tokens are minted by
   `POST /api/auth/internal/issue-agent-jwt` on the auth service — see
   [12-auth-service-integration-response.md](./12-auth-service-integration-response.md)
   for the full contract.
2. **Manifest endpoint — `GET /api/internal/manifest`.** A machine-readable
   "what I am": entities, permissions, modules. Authed by the internal secret
   header. It's how the runtime discovers your app instead of us hardcoding it.
3. **Summary endpoints.** Small, AI-shaped read endpoints (e.g.
   `GET /api/<entity>/[id]/summary`) returning a compact, already-relevant slice
   — so the AI reasons over signal, not raw noise. Aggregated rollups
   (`?view=rollup`) count.
4. **Consistent response envelope + org isolation.** Every route returns
   `{ success, data, error }` and every query is org-scoped on `orgId`. The AI
   must never be able to see another tenant's data.
5. **Internal env vars.** `INTERNAL_AI_RUNTIME_URL` and
   `INTERNAL_AI_RUNTIME_SECRET` on your side (and the runtime's). Note these are
   distinct from `QUIKIT_AI_RUNTIME_URL`, which is what the SDK reads for Model A.
6. **A compatibility doc.** Run the extraction prompt
   (`scripts/app-developer-compatibility-prompt.md`) to produce one
   `ai-compatibility-doc.md` (entities, endpoints, RBAC, envelopes, planned use
   cases, a prioritised P0–P3 change list). This is what lets the AI team build
   or route your use cases.

### Readiness checklist

| Requirement | Needed for |
|---|---|
| SDK installed + in `transpilePackages` + `AIClient` wired | Model A + B |
| `withFallback` on every AI screen | Model A + B |
| `MockAI` tests (success + failure) | Model A + B |
| Service-JWT accepted in auth wrapper | Model B |
| `GET /api/internal/manifest` | Model B |
| Per-entity `/summary` endpoints | Model B |
| `{success,data,error}` envelope + `orgId` isolation | Model B |
| `INTERNAL_AI_RUNTIME_URL` / `INTERNAL_AI_RUNTIME_SECRET` | Model B |
| Compatibility doc produced | Model B |
| Entities fed to search index | Search |

### Discovering another app's base URL

Do **not** hardcode other apps' base URLs. The **App Registry** is the source of
truth — `App.slug` → `App.baseUrl`, maintained per environment:

- Super-admin UI: `/app-registry` on the launcher (`apps.quikit.ai`, or
  `uatapps.quikit.ai` for UAT).
- Service-to-service: `GET /api/internal/apps/{slug}` on the launcher, gated by
  the `x-internal-secret` header. Apps flagged `requiresOrgAdmin` (ops surfaces
  such as the Admin Portal) are deliberately excluded — they are not valid
  targets for AI tool calls.

There is no `backendUrl` and there will not be one: apps deploy monolithically
(frontend + API at the same origin), so a separate backend URL would only invite
drift.

---

## 6. Cross-cutting agents — usable today, no enablers

The runtime has general-purpose agents not tied to any app's data: **research**,
**document analysis**, **document generation**, **data visualization** (more
coming, e.g. translation). Any app calls them through the same `AIClient` with a
cross-cutting `use_case` — no service-JWT, no manifest, no module.

This is the **fastest AI win** for any app without a bespoke runtime module: you
can ship real features (draft a document, summarise an uploaded doc, translate,
chart a dataset) immediately. A discoverable catalog is on the roadmap; until
then, ask the AI team for current cross-cutting `use_case` names.

---

## 7. Search is an AI requirement too

For your entities to appear in AI-enhanced global search, feed the search index:
call the search SDK's `indexEvent` (and `indexEventBatch`) from your
create/update handlers, and remove on delete — sending a searchable text blob +
a deep link per entity. `@quikit/search-sdk` posts index events to the search
service's `/api/internal/index-event` with an internal secret header.

> **Confirm before wiring:** re-verify the search service's production
> endpoint/interface against the live search code with the search owner (Sagar).
> Treat the shape above as the intended contract, not a frozen one.

---

## 8. Streaming and model selection

### Streaming

The runtime streams long answers over SSE (`POST /ai/execute/stream`).
`executeStream(useCase, userPrompt, onToken, options)` is callback-based: it
fires `onToken` per chunk and resolves with the final response from the
terminal `done` event. It is wrapped by `withFallback` and mirrored in `MockAI`
like every other method.

**Scope limit — read-only text use cases only.** `executeStream` throws
immediately, before any network call, if you pass
`expectedOutputType: "action" | "workflow"` or a non-empty `toolsAllowed`,
because the runtime's streaming path never populates `proposedActions` or
`toolCalls` — the response would come back well-formed and empty rather than
failing. Use `executeWithTools` for those. That throw is a plain `Error`, not an
`AIError`, so `withFallback` deliberately does **not** swallow it: it's a
programming mistake, not an outage.

`expectedOutputType: "json"` is permitted but falls back to buffered execution
server-side: no `token` events fire and the full payload arrives on `done` with
`fallback: true`. Reach for `executeStream` only where progressive rendering of
plain text actually helps.

Its `timeoutMs` is an **inactivity** timeout — the clock resets on every received
event, including keepalive pings — so a long but healthy generation is never
aborted while a genuine stall still raises `AITimeoutError`. The buffered
`execute` path bounds the whole request instead.

### Which model answers

The runtime picks the model from your `use_case`, not your app:
unregistered/generic use cases route to the **simple** chain (fast,
cost-efficient); heavier reasoning use cases route to the **complex** chain
(cloud-grade). If a Model A feature needs cloud-grade reasoning, either pass a
`model` override or ask the AI team to classify your `use_case` as complex.

---

## 9. Onboarding sequence

1. Read this guide; fill the readiness checklist (§5).
2. **Model A / cross-cutting features:** install SDK → assemble context → call
   with `withFallback` → `MockAI` tests → ship. No enablers.
3. **Model B features:** produce your compatibility doc → build the P0 enablers →
   AI team builds your runtime module → your app calls the thin `use_case` →
   test → ship.
4. **Search:** wire `indexEvent` for your entities.
5. **If you already call an LLM directly** (see §11): treat it as a migration.
   New features go through the SDK now; existing direct calls get a migration
   ticket, not an emergency rewrite.

---

## 10. FAQ

**Do we always have to put the app context in the prompt on every call?**
Yes. The model is stateless and there is **no fine-tuning** — the only way it
"knows" anything is text in the current prompt. Static definitional knowledge
(what a KPI/WWW/lead is) is re-supplied each call from in-memory constants. Live
data changes each call, so it isn't redundant — and the runtime already shrinks
it (rollups, entity summaries, token-window compression).

**Can't we fine-tune the model to remember our app?**
No, and it's the wrong tool. Your data is live and per-tenant; a fine-tune
freezes knowledge at training time, can't hold every tenant's private data
without breaking isolation, teaches behaviour not live facts (you'd still inject
the numbers), and would break provider fallback. RAG is still "put relevant text
in the prompt," not fine-tuning.

**What if we need to process 100 KPIs / 100 users at once?**
Don't send 100 raw rows. Aggregate first, then send a compact summary
(QuikScale's `?view=rollup` returns ~2KB vs ~100KB raw). For huge sets,
summarise in chunks then summarise the summaries. Reduce, then reason.

**What happens when a CEO agent needs whole-company data across apps?**
Textbook **Model B** — no single app has it. The runtime assembles cross-app
context by calling each app's summary endpoints (ideally in parallel), grounded
by the org profile. This is exactly why Model B needs the P0 enablers.

**Why not give the LLM direct database access?**
Isolation (every query must be org-scoped; a raw connection isn't), permissions
(RBAC the DB doesn't enforce), and meaning (hundreds of models across schemas are
noise without a semantic layer). The app APIs already encode isolation,
permissions, and meaning — the AI reads through them, never around them.

**Why can't we just call the LLM directly from our app?**
You lose central audit, cost tracking + budgets, prompt-injection sanitisation,
PII stripping, provider fallback, and one place to change models — and every app
drifts. The apps that do this today (HRMS, VC) have none of those protections on
those calls.

**What are the AI Runtime, Search, and Comms services?**
Runtime thinks (executes prompts, providers, safety, audit — `/ai/execute`).
Search finds (indexes your entities; AI re-ranks). Comms carries (semantic /
transport bridge + WhatsApp/Teams channels). Three separate services.

**How does the LLM handle large/complex data?**
The platform shrinks the problem before the model sees it: app-side aggregation,
summary endpoints, entity memory, token-window summarisation, retrieval, and
async jobs for very large work. The complexity is in data reduction, not the LLM.

**What if the runtime is down?**
Every AI screen has a non-AI path. `withFallback` runs your fallback and the
feature degrades gracefully. Test it with `MockAI({ simulateError })`.

**Who pays for AI, and how is cost controlled?**
Today the platform pays; the runtime tracks per-call cost and enforces
per-tenant budgets (warn at 90%, throttle non-critical at 100%). Per-org "bring
your own key" is a future capability.

**Can the AI take actions (write data), or only read?**
Reads and drafts are always allowed. Writes are risk-classed and governed
(manual/copilot/autonomous) through an approval flow; financial/irreversible
actions are never autonomous. In Model A you can also take the AI's output and
perform the write yourself in your own code.

**How do I trace/debug a specific AI call?**
Every call carries a `traceId` (on the response and in every log), written to the
audit store; the AI team can pull the full record by `traceId`.

**Module vs cross-cutting agent — what's the difference?**
A module is app-specific intelligence in the runtime (only QuikScale has these
today). A cross-cutting agent is general-purpose and tied to no app's data — any
app can call it now.

**Do I send the user's token or a special one?**
Model A: the user's existing NextAuth session token via `getToken()` — no new
credential. The service-JWT only appears in Model B, where the runtime calls
*your* API back as a service.

**If two apps need the same AI feature, is it built twice?**
No. Generic → a shared cross-cutting agent both call. Domain-specific → a runtime
module. The SDK is identical for all apps; differentiation lives in `use_case` +
runtime modules, never per-app SDK forks.

---

## 11. Per-app notes (status & starting points)

*Supplied by the AI Runtime team, verified 2026-07-02. Re-confirm against the
repo before relying on any line here.*

- **QuikScale.** Most integrated — 5 runtime modules exist (KPI, meeting,
  strategy, people, growth) and it consumes runtime endpoints today;
  `INTERNAL_AI_RUNTIME_*` are in `.env.example`. Not yet on the packaged SDK.
  Next: adopt the SDK for new in-app features; keep existing module-backed use
  cases as-is.
- **QuikTrack.** `CLAUDE.md` mandates the SDK + P0 enablers; a compatibility doc
  exists (2026-05-28). P0 enablers not yet in code. Candidates: project health
  summary, delay analysis, milestone risk, resource utilisation.
- **QuikCRM.** Mandated, nothing built yet. Candidates: lead summary/classify,
  deal health, next-best-action — good Model A or cross-cutting starts.
- **QuikHRMS.** Currently **calls LLMs directly** (Gemini + Claude fallback, ~4
  sites) — migrate to the SDK. Compatibility doc exists (2026-06-29). Special
  care: **salary / payroll / PAN / Aadhaar / PII must never enter AI context** —
  lean on summary endpoints + PII exclusion.
- **QuikVC.** Embeds Anthropic directly (~6 prompt files: transcript analysis,
  daily summary, memo sections, deal scoring, comparables, thesis fit) — migrate
  to the SDK / cross-cutting agents.
- **QuikInfra.** No AI yet. Good cross-cutting starts: BOQ/DPR summarisation,
  document analysis, project-risk narrative.
- **QuikSocial.** Has 8 `/api/ai/*` routes that proxy to a **separate external
  Python AI service** (not the runtime), authed by `QS_INTERNAL_TOKEN`. A
  platform-level divergence to resolve (consolidate vs sanctioned exception) —
  decision owner is the AI/platform lead, not this guide.
- **QuikChat, QuikAsset, QuikSupport, QuikLMS, QuikFinance.** Not covered in the
  2026-07-02 pass. Treat as "no AI yet"; cross-cutting agents are the fastest
  start.
- **admin / auth / quikit (launcher).** No app-specific AI need today.

---

## 12. Where to get help

- SDK usage, `use_case` naming, cross-cutting agent names, runtime URL, model
  classification → AI Runtime team (`#ai-integration`).
- Compatibility doc extraction prompt →
  `scripts/app-developer-compatibility-prompt.md`.
- Search indexing contract → search service owner (Sagar).
- Your app's P0 enablers / auth wrapper → platform/auth + your app's `CLAUDE.md`.
- Auth service contract (agent-JWT, `verify-token`) →
  [12-auth-service-integration-response.md](./12-auth-service-integration-response.md).
