import { AgentRunFailedError, AIError, AITimeoutError, AIValidationError } from './errors';
import type {
  AgentCatalogEntry,
  AgentRunResult,
  AgentRunStatus,
  AIClientConfig,
  AIClientLike,
  AIExecuteRequest,
  AIExecuteResponse,
  AIFallbackLike,
  AIStreamOptions,
  InvokeAgentOptions,
  InvokeAgentResponse,
  StreamTokenCallback,
  WaitForAgentRunOptions,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────
// Shared error mapping — used by both the buffered `execute` path and
// the pre-stream HTTP failure path in `executeStream`. Single source
// so the two entry points can't diverge on which errorCodes become
// `AIValidationError` vs `AIError`.
// ─────────────────────────────────────────────────────────────────

function httpErrorFrom(status: number, statusText: string, body: unknown): AIError {
  const errBody = (body ?? {}) as Record<string, unknown>;
  const code = (errBody.errorCode as string | undefined) ?? `HTTP_${status}`;
  const message =
    (errBody.detail as string | undefined) ??
    (errBody.message as string | undefined) ??
    statusText ??
    `HTTP ${status}`;
  const traceId = errBody.traceId as string | undefined;
  if (status === 422 || code === 'VALIDATION_ERROR' || code === 'SCHEMA_MISMATCH') {
    return new AIValidationError(message, code, traceId, status);
  }
  return new AIError(message, code, traceId, status);
}

// ─────────────────────────────────────────────────────────────────
// Success-path body validation.
//
// A 2xx whose body is empty, truncated, or not a JSON object is a failure,
// not a success: the runtime promised an `ExecuteResponse` and did not
// deliver one. Surfacing it as an `AIError` is what keeps the "AI down must
// never break a screen" guarantee intact — callers dereference the result
// immediately (`executeText` reads `.normalizedText`), so returning
// `undefined` here would raise a raw `TypeError` that `withFallback` cannot
// catch, and the screen would break instead of degrading.
//
// Deliberately narrow: this checks that a JSON *object* arrived, not that
// any particular field is present. Field-level validation belongs to the
// caller — over-validating here would reject responses the runtime is
// entitled to send.
// ─────────────────────────────────────────────────────────────────

function assertExecuteResponse(
  body: unknown,
  rawText: string,
  status: number,
  parseError?: string,
): AIExecuteResponse {
  if (!rawText) {
    throw new AIError('AI response body was empty', 'MALFORMED_RESPONSE', undefined, status);
  }
  if (parseError !== undefined) {
    throw new AIError(
      `AI response body was not valid JSON: ${parseError}`,
      'MALFORMED_RESPONSE',
      undefined,
      status,
    );
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AIError(
      'AI response body was not a JSON object',
      'MALFORMED_RESPONSE',
      undefined,
      status,
    );
  }
  return body as AIExecuteResponse;
}

// Build the error thrown on a terminal SSE `error` event. Mirrors the
// runtime's `{ traceId, errorCode, error }` shape (see `app/schemas/sse.py`)
// and reuses the same validation-vs-generic split as HTTP failures.
function errorFromSseEvent(data: Record<string, unknown>): AIError {
  const code = (data.errorCode as string | undefined) ?? 'AI_UNAVAILABLE';
  const message = (data.error as string | undefined) ?? code;
  const traceId = data.traceId as string | undefined;
  if (code === 'VALIDATION_ERROR' || code === 'SCHEMA_MISMATCH') {
    return new AIValidationError(message, code, traceId);
  }
  return new AIError(message, code, traceId);
}

// Map the SSE `done` event payload (camelCase, matching `ExecuteResponse`)
// onto the SDK's `AIExecuteResponse`. The streaming-only `fallback` /
// `partial` / `sessionId` fields are carried through.
function responseFromDoneEvent(d: Record<string, unknown>): AIExecuteResponse {
  return {
    mode: (d.mode as AIExecuteResponse['mode']) ?? 'manual',
    traceId: (d.traceId as string) ?? '',
    normalizedText: (d.normalizedText as string | undefined) ?? undefined,
    structuredJson: (d.structuredJson as Record<string, unknown> | undefined) ?? undefined,
    providerUsed: d.providerUsed as string | undefined,
    modelUsed: d.modelUsed as string | undefined,
    tokensInput: d.tokensInput as number | undefined,
    tokensOutput: d.tokensOutput as number | undefined,
    costEstimateUsd: d.costEstimateUsd as number | undefined,
    latencyMs: d.latencyMs as number | undefined,
    fallback: d.fallback as boolean | undefined,
    partial: d.partial as boolean | undefined,
    sessionId: (d.sessionId as string | undefined) ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────
// Streaming request guard.
//
// The runtime's streaming endpoint is text-first and cannot honour every
// request shape the buffered one can. Verified against
// `app/api/v1/execute_stream.py`:
//
//   * `toolsAllowed` — the endpoint runs the tool-call provider hook with an
//     EMPTY catalog (`catalog: list[dict[str, Any]] = []`, "provider behaves
//     as text mode"), because tool execution is explicitly out of scope for
//     S82. No tools run, so no actions are proposed.
//   * `expectedOutputType: 'action' | 'workflow'` — nothing on the streaming
//     path ever populates `proposedActions` / `toolCalls`; the terminal
//     `SseDoneEvent` schema does not even declare those fields.
//
// So these requests do not fail server-side — they succeed and come back
// well-formed and empty, which reads as "the AI proposed nothing" rather
// than "this is unsupported". Rejecting them here converts silent data loss
// into a loud, immediate failure.
//
// `'json'` is deliberately NOT rejected: the endpoint really does compute
// structured JSON on its buffered-fallback branch and ships it on the `done`
// event, and `responseFromDoneEvent` maps it. That path works today.
//
// A plain `Error` (not `AIError`) on purpose — this is a caller wiring
// mistake, not an AI outage, so `FallbackProxy` must NOT swallow it into a
// graceful degrade. Matches the adjacent `appId` guard's precedent.
// ─────────────────────────────────────────────────────────────────

export function assertStreamable(request: AIExecuteRequest): void {
  const type = request.expectedOutputType;
  if (type === 'action' || type === 'workflow') {
    const alternative = type === 'action' ? 'executeWithTools' : 'execute';
    throw new Error(
      `executeStream: expectedOutputType '${type}' is not supported. The runtime's streaming ` +
        'path never populates proposedActions or toolCalls, so the response would come back ' +
        `well-formed and empty rather than failing. Use ${alternative}() instead.`,
    );
  }
  if (request.toolsAllowed !== undefined && request.toolsAllowed.length > 0) {
    throw new Error(
      'executeStream: toolsAllowed is not supported. The runtime streams with an empty tool ' +
        'catalog, so no tools run and no proposedActions are produced — the response would ' +
        'come back well-formed and empty rather than failing. Use executeWithTools() instead.',
    );
  }
}

interface ParsedSseEvent {
  event: string;
  data: string;
}

// Parse one raw SSE event block (the text between two blank lines) into
// its `event:` type and concatenated `data:` payload. Comment lines
// (starting with `:`, e.g. the runtime's `: keepalive` pings) and blank
// lines are ignored per the SSE spec. Returns null when the block
// carries no `data:` line (e.g. a keepalive-only block).
function parseSseEvent(raw: string): ParsedSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

export class AIClient implements AIClientLike {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string> | string;
  private readonly defaultAppId?: string;
  private readonly timeoutMs: number;

  constructor(config: AIClientConfig) {
    if (!config.baseUrl) {
      throw new Error('AIClient: baseUrl is required');
    }
    if (typeof config.getToken !== 'function') {
      throw new Error('AIClient: getToken must be a function');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.getToken = config.getToken;
    this.defaultAppId = config.defaultAppId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async execute(request: AIExecuteRequest): Promise<AIExecuteResponse> {
    const finalRequest: AIExecuteRequest = {
      ...request,
      appId: request.appId ?? this.defaultAppId ?? '',
    };
    if (!finalRequest.appId) {
      throw new Error('AIClient.execute: appId is required (pass on request or via defaultAppId)');
    }

    const token = await this.getToken();
    const url = `${this.baseUrl}/ai/execute`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(finalRequest),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AITimeoutError(`AI request timed out after ${this.timeoutMs}ms`);
      }
      throw new AIError(
        err instanceof Error ? err.message : 'network error',
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    let body: unknown = undefined;
    let parseError: string | undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (err) {
        parseError = err instanceof Error ? err.message : 'invalid JSON';
      }
    }

    if (!res.ok) {
      throw httpErrorFrom(res.status, res.statusText, body);
    }

    return assertExecuteResponse(body, text, res.status, parseError);
  }

  async executeText(
    useCase: string,
    userPrompt: string,
    options?: Partial<AIExecuteRequest>,
  ): Promise<string> {
    const response = await this.execute({
      appId: options?.appId ?? this.defaultAppId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'text',
      ...options,
    });
    return response.normalizedText ?? '';
  }

  async executeStructured<T = Record<string, unknown>>(
    useCase: string,
    userPrompt: string,
    responseSchema: Record<string, unknown>,
    options?: Partial<AIExecuteRequest>,
  ): Promise<T> {
    const response = await this.execute({
      appId: options?.appId ?? this.defaultAppId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'json',
      responseSchema,
      ...options,
    });
    return (response.structuredJson ?? {}) as T;
  }

  async executeWithTools(
    useCase: string,
    userPrompt: string,
    toolsAllowed: string[],
    options?: Partial<AIExecuteRequest>,
  ): Promise<AIExecuteResponse> {
    return this.execute({
      appId: options?.appId ?? this.defaultAppId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'action',
      toolsAllowed,
      ...options,
    });
  }

  /**
   * Stream an AI execution over the runtime's SSE endpoint
   * (`POST /ai/execute/stream`), invoking `onToken` for each text chunk
   * and resolving with the final assembled response from the `done` event.
   *
   * Uses `fetch` + a `ReadableStream` reader — no new dependencies. Same
   * `Bearer` auth as the buffered path.
   *
   * Timeout is an **inactivity** timeout, not a whole-stream deadline: the
   * `timeoutMs` clock resets on every received event (including the
   * runtime's `: keepalive` pings), so a long-but-healthy generation is
   * never aborted, while a genuine stall still raises `AITimeoutError`.
   * This intentionally differs from the buffered `execute`, whose timeout
   * bounds the entire request.
   *
   * **Scope caveat — read-only text (plus structured JSON) only.** The
   * streaming endpoint omits some of the buffered pipeline's post-processing
   * (metric snapshot, `handle_result`).
   *
   * * `expectedOutputType: 'json'` with a `responseSchema` IS supported: the
   *   endpoint computes it on a buffered-fallback branch, emits NO `token`
   *   events, and ships the payload on the `done` event with
   *   `fallback: true`.
   * * `expectedOutputType: 'action' | 'workflow'`, and any non-empty
   *   `toolsAllowed`, are REJECTED before the request is sent — see
   *   `assertStreamable`. The streaming path runs tools with an empty
   *   catalog and never populates `proposedActions` / `toolCalls`, so such a
   *   request would otherwise succeed with an empty result. Use
   *   `executeWithTools` for those.
   *
   * @throws {Error} synchronously, before any network call, for a request
   *   shape the streaming endpoint cannot honour (see `assertStreamable`).
   *   Deliberately NOT an `AIError`, so `withFallback` does not mask it.
   * @throws {AITimeoutError} on inactivity timeout
   * @throws {AIValidationError} on a `VALIDATION_ERROR` / `SCHEMA_MISMATCH`
   *   terminal error event or HTTP 422
   * @throws {AIError} on any other terminal `error` event, HTTP failure,
   *   or a stream that ends without a terminal `done` / `error` event
   */
  async executeStream(
    useCase: string,
    userPrompt: string,
    onToken: StreamTokenCallback,
    options?: AIStreamOptions,
  ): Promise<AIExecuteResponse> {
    const { onStatus, ...requestOptions } = options ?? {};
    const finalRequest: AIExecuteRequest = {
      appId: requestOptions.appId ?? this.defaultAppId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'text',
      ...requestOptions,
    };
    if (!finalRequest.appId) {
      throw new Error(
        'AIClient.executeStream: appId is required (pass on options or via defaultAppId)',
      );
    }
    // Reject shapes the streaming endpoint cannot honour, BEFORE any network
    // call — see `assertStreamable`.
    assertStreamable(finalRequest);

    const token = await this.getToken();
    const url = `${this.baseUrl}/ai/execute/stream`;

    // Inactivity timeout — reset on every received event (see doc comment).
    const controller = new AbortController();
    // `| undefined` is required for definite-assignment analysis: TS cannot
    // see that `resetTimeout()` below assigns before any `clearTimeout` use.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    };
    resetTimeout();

    let res: Response;
    try {
      res = await globalThis.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(finalRequest),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AITimeoutError(`AI stream timed out after ${this.timeoutMs}ms of inactivity`);
      }
      throw new AIError(err instanceof Error ? err.message : 'network error', 'NETWORK_ERROR');
    }

    if (!res.ok) {
      clearTimeout(timeoutId);
      const text = await res.text();
      let body: unknown = undefined;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
      }
      throw httpErrorFrom(res.status, res.statusText, body);
    }

    if (!res.body) {
      clearTimeout(timeoutId);
      throw new AIError('AI stream response had no body', 'NETWORK_ERROR');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: AIExecuteResponse | undefined;
    let streamError: AIError | undefined;

    try {
      while (true) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        resetTimeout();
        // Normalise CRLF so the `\n\n` event delimiter matches even if a
        // proxy rewrote line endings.
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const parsed = parseSseEvent(rawEvent);
          if (!parsed) continue; // keepalive / comment-only block
          switch (parsed.event) {
            case 'status': {
              if (onStatus) {
                const s = JSON.parse(parsed.data) as { stage?: string; message?: string };
                onStatus(s.stage ?? '', s.message ?? '');
              }
              break;
            }
            case 'token': {
              const t = JSON.parse(parsed.data) as { text?: string };
              if (t.text) onToken(t.text);
              break;
            }
            case 'done': {
              done = responseFromDoneEvent(JSON.parse(parsed.data) as Record<string, unknown>);
              break;
            }
            case 'error': {
              streamError = errorFromSseEvent(JSON.parse(parsed.data) as Record<string, unknown>);
              break;
            }
            default:
              break;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AITimeoutError(`AI stream timed out after ${this.timeoutMs}ms of inactivity`);
      }
      if (err instanceof AIError) throw err;
      throw new AIError(err instanceof Error ? err.message : 'stream read error', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }

    // Terminal event handling — exactly one of `done` / `error` per the
    // runtime contract; guard against a truncated stream that had neither.
    if (streamError) throw streamError;
    if (done) return done;
    throw new AIError('AI stream ended without a terminal done or error event', 'STREAM_INCOMPLETE');
  }

  // ─────────────────────────────────────────────────────────────
  // Agent gateway — invoke / poll / wait / list (P3-S167, wraps
  // `app/api/v1/agents.py`). See method doc-comments for behaviour.
  // ─────────────────────────────────────────────────────────────

  /**
   * Enqueue an async agent invocation. Returns `{runId, status}` — the
   * runtime replies **202 Accepted** for BOTH a fresh invoke and an
   * idempotent replay (Stripe convention). Poll `runId` with
   * `getAgentRun` or `waitForAgentRun` for the terminal result.
   *
   * `opts.idempotencyKey` — a retry with the same `(org, key)` returns
   * the ORIGINAL `runId`, so callers can safely retry on network failure
   * without double-billing.
   *
   * `opts.appId` — attribution only; lands in `agent_runs.app_id` and
   * telemetry. Not a privilege boundary.
   *
   * **`withFallback` note**: `invokeAgent` returning `undefined` via the
   * fallback proxy means the run did NOT start — usually a bug in your
   * integration (bad token, unknown agent, malformed payload) rather
   * than an outage. Prefer to await this directly and catch `AIError`.
   *
   * @throws {AIError} on 404 (unknown or non-exposable agent), network,
   *   or any other transport failure
   * @throws {AIValidationError} on 422 (payload fails the agent's
   *   `input_schema`)
   * @throws {AITimeoutError} on the client-level `timeoutMs` deadline
   */
  async invokeAgent(
    agentName: string,
    payload: Record<string, unknown>,
    opts?: InvokeAgentOptions,
  ): Promise<InvokeAgentResponse> {
    const body: Record<string, unknown> = { payload };
    if (opts?.appId !== undefined) body.appId = opts.appId;
    if (opts?.idempotencyKey !== undefined) body.idempotencyKey = opts.idempotencyKey;
    const encoded = encodeURIComponent(agentName);
    const raw = await this._jsonRequest(
      'POST',
      `/ai/agents/${encoded}/invoke`,
      body,
      /* requireAuth */ true,
    );
    return {
      runId: String((raw as Record<string, unknown>).runId ?? ''),
      status: String((raw as Record<string, unknown>).status ?? ''),
    };
  }

  /**
   * Fetch one agent run's current state. Returns `AgentRunResult` with
   * `status` in {queued, running, completed, failed, partial}; `output`
   * is null until the run reaches a terminal state.
   *
   * @throws {AIError} on 404 (unknown runId, cross-org, or persona-kind
   *   run per the gateway's kind-gate), network, or transport failure
   */
  async getAgentRun(runId: string): Promise<AgentRunResult> {
    const encoded = encodeURIComponent(runId);
    const raw = (await this._jsonRequest(
      'GET',
      `/ai/agents/runs/${encoded}`,
      undefined,
      /* requireAuth */ true,
    )) as Record<string, unknown>;
    return {
      runId: String(raw.runId ?? runId),
      agentName: String(raw.agentName ?? ''),
      status: (raw.status as AgentRunStatus) ?? 'queued',
      output: (raw.output as Record<string, unknown> | null) ?? null,
      error: (raw.error as string | null) ?? null,
      startedAt: (raw.startedAt as string | null) ?? null,
      completedAt: (raw.completedAt as string | null) ?? null,
      createdAt: (raw.createdAt as string | null) ?? null,
    };
  }

  /**
   * Poll `getAgentRun` until the run reaches a terminal state.
   *
   * **Poll spacing — exponential-then-cap.** Starts at `initialPollMs`
   * (default 1_000ms), doubles each poll, ceilings at `maxPollMs`
   * (default 5_000ms). Progression: 1s → 2s → 4s → 5s → 5s → ...
   * A run that's already completed on first poll returns after ~1s;
   * a 60-second extraction polls ~13× total without hammering.
   *
   * **Timeout — default 360_000ms (6 min).** MUST exceed the runtime's
   * per-run deadline (300s) or the SDK would give up on runs the
   * server is still legitimately executing. On timeout, throws
   * `AITimeoutError`; the caller can still poll manually via
   * `getAgentRun`.
   *
   * **Terminal-state rules:**
   *   * `completed` → resolve with the full result.
   *   * `partial` → resolve (honest status; the agent surfaced partial
   *     success). Unreachable on the cross-cutting path today —
   *     `agent_invocation.py` writes only completed/failed — kept as
   *     forward-compat for the shared `agent_runs.status` enum.
   *   * `failed` → **throw `AgentRunFailedError`** carrying `runId`,
   *     the run's `error` message, AND its `output` (a failed run
   *     still surfaces structured detail per AG3 correction #3 —
   *     e.g. `document_analysis` on a scanned PDF returns
   *     `{reason: "no_extractable_text", next_action: "use_rag"}`).
   *   * `queued` / `running` → keep polling.
   *
   * **`withFallback` note**: `waitForAgentRun` under `withFallback`
   * degrades on transport errors (`AIError` / `AITimeoutError`) but
   * DOES NOT swallow `AgentRunFailedError` — that's a definitive
   * server answer, not a transport blip. See `errors.ts::AgentRunFailedError`.
   *
   * @throws {AgentRunFailedError} on terminal `failed` status
   * @throws {AITimeoutError} when the timeout elapses without a
   *   terminal state
   * @throws {AIError} on any transport/HTTP failure during polling
   */
  async waitForAgentRun(runId: string, opts?: WaitForAgentRunOptions): Promise<AgentRunResult> {
    const timeoutMs = opts?.timeoutMs ?? 360_000;
    const initialPollMs = opts?.initialPollMs ?? 1_000;
    const maxPollMs = opts?.maxPollMs ?? 5_000;
    const start = Date.now();
    let nextDelay = initialPollMs;

    // Loop is bounded by both the timeout check and the terminal-state
    // exits; a rogue non-terminal response can't spin forever.
    while (true) {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) {
        throw new AITimeoutError(
          `waitForAgentRun: run ${runId} did not reach a terminal state within ${timeoutMs}ms; ` +
            'the run may still be executing — poll manually with getAgentRun',
        );
      }
      const result = await this.getAgentRun(runId);
      if (result.status === 'completed' || result.status === 'partial') {
        return result;
      }
      if (result.status === 'failed') {
        throw new AgentRunFailedError(
          runId,
          `agent run ${runId} failed: ${result.error ?? '(no error detail from runtime)'}`,
          result.output,
        );
      }
      // Non-terminal — sleep and poll again. Bound the sleep by the
      // remaining budget so we don't oversleep past the timeout.
      const sleepMs = Math.min(nextDelay, Math.max(0, remaining));
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      nextDelay = Math.min(nextDelay * 2, maxPollMs);
    }
  }

  /**
   * List the runtime's exposable cross-cutting agents. Wraps the public
   * `GET /ai/agents` — **no auth token is sent** (the runtime has
   * `/ai/agents` in `_SKIP_PATHS`), so this is safe to call before the
   * user session exists.
   *
   * @throws {AIError} on transport/HTTP failure
   */
  async listAgents(): Promise<AgentCatalogEntry[]> {
    const raw = (await this._jsonRequest(
      'GET',
      '/ai/agents',
      undefined,
      /* requireAuth */ false,
    )) as Record<string, unknown>;
    const list = Array.isArray(raw.agents) ? (raw.agents as Array<Record<string, unknown>>) : [];
    return list.map((entry) => ({
      name: String(entry.name ?? ''),
      displayName: String(entry.displayName ?? ''),
      description: String(entry.description ?? ''),
      inputSchema: (entry.inputSchema as Record<string, unknown>) ?? {},
      outputSchema: (entry.outputSchema as Record<string, unknown>) ?? {},
      riskClass: (entry.riskClass as 'read' | 'draft') ?? 'read',
      version: String(entry.version ?? ''),
    }));
  }

  /**
   * Shared JSON request helper for the gateway methods. Same error
   * mapping as `execute` (`httpErrorFrom`, `assertExecuteResponse` shape
   * checks in miniature), same `timeoutMs` clock, same auth pattern.
   * Kept private — the four public methods above are the SDK surface.
   *
   * `requireAuth=false` skips the Bearer header for the public catalog.
   */
  private async _jsonRequest(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    requireAuth: boolean,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (requireAuth) {
      const token = await this.getToken();
      headers.authorization = `Bearer ${token}`;
    }
    let res: Response;
    try {
      res = await globalThis.fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AITimeoutError(`AI request timed out after ${this.timeoutMs}ms`);
      }
      throw new AIError(err instanceof Error ? err.message : 'network error', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        if (res.ok) {
          throw new AIError(
            `AI response body was not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
            'MALFORMED_RESPONSE',
            undefined,
            res.status,
          );
        }
      }
    }
    if (!res.ok) {
      throw httpErrorFrom(res.status, res.statusText, parsed);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AIError(
        'AI response body was not a JSON object',
        'MALFORMED_RESPONSE',
        undefined,
        res.status,
      );
    }
    return parsed;
  }

  withFallback(fn: (err?: AIError) => void): FallbackProxy {
    return new FallbackProxy(this, fn);
  }
}

/**
 * Graceful-degradation wrapper: every method returns `undefined` and invokes
 * `fn(err)` instead of throwing when the underlying call fails with an
 * `AIError`. Non-`AIError` throws (programmer errors — a missing `appId`, a
 * `getToken` that itself throws) still propagate, because those are bugs to
 * fix, not outages to degrade around.
 *
 * Typed against `AIClientLike` rather than `AIClient` so `MockAI` reuses this
 * exact implementation — the test double's fallback behaviour is then the
 * same code, not a parallel copy that can drift from it.
 */
export class FallbackProxy implements AIFallbackLike {
  private readonly client: AIClientLike;
  private readonly fn: (err?: AIError) => void;

  constructor(client: AIClientLike, fn: (err?: AIError) => void) {
    this.client = client;
    this.fn = fn;
  }

  async execute(request: AIExecuteRequest): Promise<AIExecuteResponse | undefined> {
    try {
      return await this.client.execute(request);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async executeText(
    useCase: string,
    userPrompt: string,
    options?: Partial<AIExecuteRequest>,
  ): Promise<string | undefined> {
    try {
      return await this.client.executeText(useCase, userPrompt, options);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async executeStructured<T = Record<string, unknown>>(
    useCase: string,
    userPrompt: string,
    responseSchema: Record<string, unknown>,
    options?: Partial<AIExecuteRequest>,
  ): Promise<T | undefined> {
    try {
      return await this.client.executeStructured<T>(useCase, userPrompt, responseSchema, options);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async executeWithTools(
    useCase: string,
    userPrompt: string,
    toolsAllowed: string[],
    options?: Partial<AIExecuteRequest>,
  ): Promise<AIExecuteResponse | undefined> {
    try {
      return await this.client.executeWithTools(useCase, userPrompt, toolsAllowed, options);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async executeStream(
    useCase: string,
    userPrompt: string,
    onToken: StreamTokenCallback,
    options?: AIStreamOptions,
  ): Promise<AIExecuteResponse | undefined> {
    try {
      return await this.client.executeStream(useCase, userPrompt, onToken, options);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  /**
   * **`invokeAgent` returning `undefined` means the run DID NOT START.**
   * Usually a bug (bad token, unknown agent, malformed payload) rather
   * than an outage — prefer to await directly and catch `AIError` for
   * these. Fallback shape is preserved for parity with the rest of
   * the client surface.
   */
  async invokeAgent(
    agentName: string,
    payload: Record<string, unknown>,
    opts?: InvokeAgentOptions,
  ): Promise<InvokeAgentResponse | undefined> {
    try {
      return await this.client.invokeAgent(agentName, payload, opts);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async getAgentRun(runId: string): Promise<AgentRunResult | undefined> {
    try {
      return await this.client.getAgentRun(runId);
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  /**
   * **Deliberate divergence — `AgentRunFailedError` PROPAGATES.**
   *
   * `waitForAgentRun` degrades on transport errors (`AIError` /
   * `AITimeoutError` — network blip, HTTP failure, gave-up-waiting)
   * but DOES NOT swallow `AgentRunFailedError`. A failed run is a
   * SUCCESSFUL call to the server — the SDK got a definitive terminal
   * answer, and callers must handle it explicitly. Falling back would
   * erase the server's verdict AND its structured failure detail
   * (e.g. `document_analysis` scanned-PDF: `{reason:
   * "no_extractable_text", next_action: "use_rag"}`) into an
   * indistinguishable `undefined`, hiding the exact reason the caller
   * would want to act on.
   *
   * Order matters: `AgentRunFailedError extends AIError`, so the
   * `instanceof AgentRunFailedError` check MUST run first — otherwise
   * the broader `AIError` catch swallows it.
   */
  async waitForAgentRun(
    runId: string,
    opts?: WaitForAgentRunOptions,
  ): Promise<AgentRunResult | undefined> {
    try {
      return await this.client.waitForAgentRun(runId, opts);
    } catch (err) {
      if (err instanceof AgentRunFailedError) {
        // Definitive server answer — callers must handle explicitly.
        throw err;
      }
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }

  async listAgents(): Promise<AgentCatalogEntry[] | undefined> {
    try {
      return await this.client.listAgents();
    } catch (err) {
      if (err instanceof AIError) {
        this.fn(err);
        return undefined;
      }
      throw err;
    }
  }
}

export { AIClient as QuikitAI };
