import type { AIError } from './errors';

export type Mode = 'manual' | 'copilot' | 'autonomous';

export type ExpectedOutputType = 'text' | 'json' | 'action' | 'workflow';

/**
 * The body of `POST /ai/execute`.
 *
 * **Every field name here is a wire contract.** `client.ts` passes this object
 * to `JSON.stringify` verbatim — no key mapping anywhere — and the runtime's
 * `ExecuteRequest` sets `extra="forbid"`, so a field name this SDK gets wrong
 * is a 422 on the whole request, not a silently ignored key. Source of truth:
 * runtime `app/schemas/execute.py::ExecuteRequest`. The
 * `request-shape.test.ts` key-set guard pins this file against that one.
 */
export interface AIExecuteRequest {
  appId: string;
  useCase: string;
  userPrompt: string;
  expectedOutputType: ExpectedOutputType;
  systemPrompt?: string;
  responseSchema?: Record<string, unknown>;
  contextData?: Record<string, unknown>;
  /**
   * Entity routing — the record this call is about. Drives `AppAIModule`
   * resolution and lets the resolved module load that record's context
   * before the LLM runs.
   *
   * **Omitting these does not fail loudly.** The module still resolves, the
   * call still returns 200, and the module's name still appears in the
   * trace — but `build_context` has no id to fetch with, so the answer is
   * built without the entity's data. Pass them whenever the use case is
   * about a specific record.
   */
  entityId?: string;
  entityType?: string;
  /**
   * Model override. Named `modelPreference` because that is the runtime's
   * alias — it was `model` here until v0.3.0, which the runtime rejected
   * with a 422 under `extra="forbid"`.
   */
  modelPreference?: string;
  temperature?: number;
  maxOutputTokens?: number;
  toolsAllowed?: string[];
  sessionId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolCallRaw {
  toolName: string;
  inputPayload: Record<string, unknown>;
  callId?: string;
}

export interface ProposedAction {
  toolName: string;
  inputPayload: Record<string, unknown>;
  description: string;
  estimatedEffect: string;
  executionResult?: Record<string, unknown>;
  permissionDenied: boolean;
  error?: string;
}

export interface AIExecuteResponse {
  mode: Mode;
  traceId: string;
  normalizedText?: string;
  structuredJson?: Record<string, unknown>;
  proposedActions?: ProposedAction[];
  toolCalls?: ToolCallRaw[];
  providerUsed?: string;
  modelUsed?: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensUsed?: TokenUsage;
  costEstimateUsd?: number;
  latencyMs?: number;
  retryCount?: number;
  gracefulFallback?: boolean;
  errorCode?: string;
  // Streaming-only fields, populated from the SSE `done` event by
  // `executeStream`. Absent on the buffered `/ai/execute` path.
  //   * `fallback`  — the stream used the buffered path (tool-use /
  //     structured-JSON) and delivered the full text on `done` rather
  //     than as `token` events.
  //   * `partial`   — the LLM stream timed out mid-generation but some
  //     tokens accumulated; `normalizedText` carries what was produced.
  //   * `sessionId` — the resolved session id when session memory is in play.
  fallback?: boolean;
  partial?: boolean;
  sessionId?: string;
}

// ─────────────────────────────────────────────────────────────────
// Streaming (executeStream) callback + option types
// ─────────────────────────────────────────────────────────────────

/** Called once per streamed text chunk. */
export type StreamTokenCallback = (chunk: string) => void;

/** Called on each pipeline `status` event during a stream. */
export type StreamStatusCallback = (stage: string, message: string) => void;

/**
 * Options for `executeStream`. Extends the buffered request options with an
 * optional `onStatus` hook that surfaces the pipeline `status` events
 * (setup → context_build → enrichment → pre_llm → llm_call).
 */
export interface AIStreamOptions extends Partial<AIExecuteRequest> {
  onStatus?: StreamStatusCallback;
}

export interface AIClientConfig {
  baseUrl: string;
  getToken: () => Promise<string> | string;
  defaultAppId?: string;
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────
// Agent gateway (P3-S162+ / SDK: S167)
//
// The async gateway at `/ai/agents/*` — invoke returns 202 + runId,
// poll for the terminal state. Wrapped by `invokeAgent` /
// `getAgentRun` / `waitForAgentRun` / `listAgents`.
// ─────────────────────────────────────────────────────────────────

/**
 * Terminal statuses on the cross-cutting run path today are `completed`
 * and `failed` only — `agent_invocation.py` writes exactly those. `partial`
 * is part of the shared `agent_runs.status` enum (inherited from the persona
 * runner) but no cross-cutting write path produces it; `waitForAgentRun`
 * treats it as forward-compatible non-failure but it is unreachable today.
 * `queued` and `running` are non-terminal (polled through).
 */
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'partial';

export interface AgentRunResult {
  runId: string;
  agentName: string;
  status: AgentRunStatus;
  /**
   * The agent's `output` payload. `null` until the run reaches a terminal
   * state; on `failed`, still populated with any structured detail the
   * agent surfaced alongside the failure (e.g. `document_analysis` on a
   * scanned PDF: `{reason: "no_extractable_text", next_action: "use_rag"}`).
   * `waitForAgentRun` attaches this to the thrown `AgentRunFailedError`
   * so the caller doesn't lose it on the reject path.
   */
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface AgentCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  /** Lowercase wire value — `"read"` or `"draft"` today (the gateway's exposable set). */
  riskClass: 'read' | 'draft';
  version: string;
}

export interface InvokeAgentOptions {
  appId?: string;
  /**
   * If set, `POST /ai/agents/{name}/invoke` is idempotent on
   * `(org, idempotencyKey)`: a repeat call returns the ORIGINAL `runId`
   * (Stripe convention — both fresh and replay return 202). Use when the
   * caller might retry the invoke on network failure and MUST NOT
   * accidentally double-bill a run.
   */
  idempotencyKey?: string;
}

export interface InvokeAgentResponse {
  runId: string;
  status: string;
}

/**
 * Options for `waitForAgentRun`. See the client method's doc-comment for
 * the poll strategy, timeout floor, and terminal-state rules.
 */
export interface WaitForAgentRunOptions {
  /**
   * Total wait duration cap. Default 360_000ms (6 min) — MUST exceed the
   * runtime's own per-run deadline (`settings.agent_run_deadline_seconds`,
   * 300s) or the SDK would give up on runs the server is still legitimately
   * executing. On timeout, `AITimeoutError` is thrown; the caller can still
   * poll manually via `getAgentRun`.
   */
  timeoutMs?: number;
  /** Initial poll delay. Default 1_000ms. */
  initialPollMs?: number;
  /** Ceiling for exponential-then-cap backoff. Default 5_000ms. */
  maxPollMs?: number;
}

export interface MockCall {
  useCase: string;
  userPrompt: string;
  appId: string;
  request: AIExecuteRequest;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────
// Shared client surface
//
// `AIClient` (real) and `MockAI` (test double) both implement
// `AIClientLike`, so application code can be typed against the interface and
// take either one:
//
//     const ai: AIClientLike = process.env.NODE_ENV === 'test'
//       ? new MockAI({ defaultText: 'mock summary' })
//       : new AIClient({ baseUrl: process.env.QUIKIT_AI_RUNTIME_URL!, getToken });
//
// Both classes declare `implements AIClientLike`, so the compiler fails the
// build if either drifts from the other — which is the point: the SDK
// mandates `withFallback` on every AI screen, and that pattern has to be
// exercisable against the mock, not just the real client.
// ─────────────────────────────────────────────────────────────────

/**
 * The surface returned by `withFallback`. Mirrors `AIClientLike`'s execute
 * methods, but every result widens to `| undefined` — that is the degraded
 * value delivered when the underlying call fails with an `AIError`.
 *
 * **`waitForAgentRun` is deliberately different** — it degrades on
 * transport errors (`AIError` / `AITimeoutError`) but **propagates
 * `AgentRunFailedError`**. A failed run is a successful call to the
 * server, and callers must handle it explicitly. See the error class
 * `errors.ts::AgentRunFailedError` for the rationale.
 */
export interface AIFallbackLike {
  execute(request: AIExecuteRequest): Promise<AIExecuteResponse | undefined>;
  executeText(
    useCase: string,
    userPrompt: string,
    options?: Partial<AIExecuteRequest>,
  ): Promise<string | undefined>;
  executeStructured<T = Record<string, unknown>>(
    useCase: string,
    userPrompt: string,
    responseSchema: Record<string, unknown>,
    options?: Partial<AIExecuteRequest>,
  ): Promise<T | undefined>;
  executeWithTools(
    useCase: string,
    userPrompt: string,
    toolsAllowed: string[],
    options?: Partial<AIExecuteRequest>,
  ): Promise<AIExecuteResponse | undefined>;
  executeStream(
    useCase: string,
    userPrompt: string,
    onToken: StreamTokenCallback,
    options?: AIStreamOptions,
  ): Promise<AIExecuteResponse | undefined>;
  invokeAgent(
    agentName: string,
    payload: Record<string, unknown>,
    opts?: InvokeAgentOptions,
  ): Promise<InvokeAgentResponse | undefined>;
  getAgentRun(runId: string): Promise<AgentRunResult | undefined>;
  waitForAgentRun(
    runId: string,
    opts?: WaitForAgentRunOptions,
  ): Promise<AgentRunResult | undefined>;
  listAgents(): Promise<AgentCatalogEntry[] | undefined>;
}

/** The full client surface shared by `AIClient` and `MockAI`. */
export interface AIClientLike {
  execute(request: AIExecuteRequest): Promise<AIExecuteResponse>;
  executeText(
    useCase: string,
    userPrompt: string,
    options?: Partial<AIExecuteRequest>,
  ): Promise<string>;
  executeStructured<T = Record<string, unknown>>(
    useCase: string,
    userPrompt: string,
    responseSchema: Record<string, unknown>,
    options?: Partial<AIExecuteRequest>,
  ): Promise<T>;
  executeWithTools(
    useCase: string,
    userPrompt: string,
    toolsAllowed: string[],
    options?: Partial<AIExecuteRequest>,
  ): Promise<AIExecuteResponse>;
  executeStream(
    useCase: string,
    userPrompt: string,
    onToken: StreamTokenCallback,
    options?: AIStreamOptions,
  ): Promise<AIExecuteResponse>;
  invokeAgent(
    agentName: string,
    payload: Record<string, unknown>,
    opts?: InvokeAgentOptions,
  ): Promise<InvokeAgentResponse>;
  getAgentRun(runId: string): Promise<AgentRunResult>;
  waitForAgentRun(runId: string, opts?: WaitForAgentRunOptions): Promise<AgentRunResult>;
  listAgents(): Promise<AgentCatalogEntry[]>;
  withFallback(fn: (err?: AIError) => void): AIFallbackLike;
}
