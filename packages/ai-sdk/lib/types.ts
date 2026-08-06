import type { AIError } from './errors';

export type Mode = 'manual' | 'copilot' | 'autonomous';

export type ExpectedOutputType = 'text' | 'json' | 'action' | 'workflow';

export interface AIExecuteRequest {
  appId: string;
  useCase: string;
  userPrompt: string;
  expectedOutputType: ExpectedOutputType;
  systemPrompt?: string;
  responseSchema?: Record<string, unknown>;
  contextData?: Record<string, unknown>;
  model?: string;
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
  withFallback(fn: (err?: AIError) => void): AIFallbackLike;
}
