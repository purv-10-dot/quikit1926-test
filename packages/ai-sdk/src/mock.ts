import { FallbackProxy, assertStreamable } from './client';
import { AgentRunFailedError, AIError } from './errors';
import type {
  AgentCatalogEntry,
  AgentRunResult,
  AIClientLike,
  AIExecuteRequest,
  AIExecuteResponse,
  AIStreamOptions,
  InvokeAgentOptions,
  InvokeAgentResponse,
  MockCall,
  StreamTokenCallback,
  WaitForAgentRunOptions,
} from './types';

interface MockConfig {
  defaultText?: string;
  defaultStructured?: Record<string, unknown>;
  responses?: Map<string, Partial<AIExecuteResponse>>;
  simulateLatencyMs?: number;
  simulateError?: { code: string; message: string };
  /**
   * Agent gateway (P3-S167) mock config. `agentRuns` maps `runId → the
   * canned poll result`; if a caller calls `getAgentRun`/`waitForAgentRun`
   * for an unknown runId, MockAI returns a deterministic `completed`
   * placeholder. `agentCatalog` overrides the default single-entry
   * catalog. `simulateAgentFailure` — configure `waitForAgentRun` to
   * throw `AgentRunFailedError` so tests can exercise the propagate-through-
   * fallback branch.
   */
  agentRuns?: Map<string, AgentRunResult>;
  agentCatalog?: AgentCatalogEntry[];
  simulateAgentFailure?: {
    runId?: string;
    error: string;
    output: Record<string, unknown> | null;
  };
}

let traceCounter = 0;
function nextTraceId(): string {
  traceCounter += 1;
  return `mock-trace-${Date.now()}-${traceCounter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Split text into up to `n` roughly-equal chunks, mimicking the real
// endpoint's incremental token stream so tests can assert per-chunk
// `onToken` behaviour.
function splitIntoChunks(text: string, n: number): string[] {
  if (!text) return [];
  const size = Math.ceil(text.length / n);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export class MockAI implements AIClientLike {
  private readonly _calls: MockCall[] = [];
  private readonly defaultText: string;
  private readonly defaultStructured: Record<string, unknown>;
  private readonly responses: Map<string, Partial<AIExecuteResponse>>;
  private readonly simulateLatencyMs: number;
  private readonly simulateError?: { code: string; message: string };
  private readonly agentRuns: Map<string, AgentRunResult>;
  private readonly agentCatalog: AgentCatalogEntry[];
  private readonly simulateAgentFailure?: {
    runId?: string;
    error: string;
    output: Record<string, unknown> | null;
  };

  constructor(config?: MockConfig) {
    this.defaultText = config?.defaultText ?? 'Mock AI response.';
    this.defaultStructured = config?.defaultStructured ?? {};
    this.responses = config?.responses ?? new Map();
    this.simulateLatencyMs = config?.simulateLatencyMs ?? 0;
    this.simulateError = config?.simulateError;
    this.agentRuns = config?.agentRuns ?? new Map();
    this.agentCatalog =
      config?.agentCatalog ?? [
        {
          name: 'document_extract',
          displayName: 'Document Extract Agent',
          description:
            'Extract structured fields from a document. Named-schema or caller-supplied schema.',
          inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { fields: { type: 'object' } } },
          riskClass: 'read',
          version: '1.0.0',
        },
      ];
    this.simulateAgentFailure = config?.simulateAgentFailure;
  }

  get calls(): MockCall[] {
    return this._calls.slice();
  }

  reset(): void {
    this._calls.length = 0;
  }

  async execute(request: AIExecuteRequest): Promise<AIExecuteResponse> {
    this._calls.push({
      useCase: request.useCase,
      userPrompt: request.userPrompt,
      appId: request.appId,
      request,
      timestamp: Date.now(),
    });

    if (this.simulateLatencyMs > 0) {
      await sleep(this.simulateLatencyMs);
    }

    if (this.simulateError) {
      throw new AIError(
        this.simulateError.message,
        this.simulateError.code,
        nextTraceId(),
      );
    }

    const override = this.responses.get(request.useCase) ?? {};
    const base: AIExecuteResponse = {
      mode: 'manual',
      traceId: nextTraceId(),
      providerUsed: 'mock',
      modelUsed: 'mock-model',
      tokensInput: 0,
      tokensOutput: 0,
      tokensUsed: { inputTokens: 0, outputTokens: 0 },
      costEstimateUsd: 0,
      latencyMs: this.simulateLatencyMs,
      retryCount: 0,
      gracefulFallback: false,
    };

    if (request.expectedOutputType === 'text') {
      base.normalizedText = this.defaultText;
    } else if (request.expectedOutputType === 'json') {
      base.structuredJson = this.defaultStructured;
    } else if (request.expectedOutputType === 'action') {
      base.proposedActions = [];
    }

    return { ...base, ...override };
  }

  async executeText(
    useCase: string,
    userPrompt: string,
    options?: Partial<AIExecuteRequest>,
  ): Promise<string> {
    const response = await this.execute({
      appId: options?.appId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'text',
      ...options,
    });
    return response.normalizedText ?? this.defaultText;
  }

  async executeStructured<T = Record<string, unknown>>(
    useCase: string,
    userPrompt: string,
    responseSchema: Record<string, unknown>,
    options?: Partial<AIExecuteRequest>,
  ): Promise<T> {
    const response = await this.execute({
      appId: options?.appId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'json',
      responseSchema,
      ...options,
    });
    return (response.structuredJson ?? this.defaultStructured) as T;
  }

  async executeWithTools(
    useCase: string,
    userPrompt: string,
    toolsAllowed: string[],
    options?: Partial<AIExecuteRequest>,
  ): Promise<AIExecuteResponse> {
    return this.execute({
      appId: options?.appId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'action',
      toolsAllowed,
      ...options,
    });
  }

  async executeStream(
    useCase: string,
    userPrompt: string,
    onToken: StreamTokenCallback,
    options?: AIStreamOptions,
  ): Promise<AIExecuteResponse> {
    const { onStatus, ...requestOptions } = options ?? {};
    const request: AIExecuteRequest = {
      appId: requestOptions.appId ?? '',
      useCase,
      userPrompt,
      expectedOutputType: 'text',
      ...requestOptions,
    };
    // Same guard as `AIClient.executeStream`, from the same function, so a
    // component that passes against the mock cannot then throw against the
    // real client. Rejected before the call is recorded — a request the real
    // client would never send should not appear in `calls`.
    assertStreamable(request);
    this._calls.push({
      useCase: request.useCase,
      userPrompt: request.userPrompt,
      appId: request.appId,
      request,
      timestamp: Date.now(),
    });

    if (this.simulateLatencyMs > 0) {
      await sleep(this.simulateLatencyMs);
    }

    if (this.simulateError) {
      throw new AIError(this.simulateError.message, this.simulateError.code, nextTraceId());
    }

    const override = this.responses.get(request.useCase) ?? {};
    const text = override.normalizedText ?? this.defaultText;

    if (onStatus) {
      onStatus('llm_call', 'Generating insights...');
    }
    for (const chunk of splitIntoChunks(text, 3)) {
      onToken(chunk);
    }

    const base: AIExecuteResponse = {
      mode: 'manual',
      traceId: nextTraceId(),
      providerUsed: 'mock',
      modelUsed: 'mock-model',
      tokensInput: 0,
      tokensOutput: 0,
      tokensUsed: { inputTokens: 0, outputTokens: 0 },
      costEstimateUsd: 0,
      latencyMs: this.simulateLatencyMs,
      retryCount: 0,
      gracefulFallback: false,
      normalizedText: text,
      fallback: false,
      partial: false,
    };

    return { ...base, ...override };
  }

  // ─────────────────────────────────────────────────────────────
  // Agent gateway (P3-S167) — deterministic; no polling under the
  // mock. `waitForAgentRun` returns immediately with the same
  // canned result `getAgentRun` would return, so app tests that
  // await an extraction don't sleep for real time.
  // ─────────────────────────────────────────────────────────────

  async invokeAgent(
    agentName: string,
    payload: Record<string, unknown>,
    opts?: InvokeAgentOptions,
  ): Promise<InvokeAgentResponse> {
    // Record the invoke so tests can assert integration shape. The mock
    // doesn't have `MockCall` for agents (it's execute-shaped), so we
    // reuse it minimally: `useCase` = `agent.<name>`.
    this._calls.push({
      useCase: `agent.${agentName}`,
      userPrompt: '',
      appId: opts?.appId ?? '',
      request: {
        appId: opts?.appId ?? '',
        useCase: `agent.${agentName}`,
        userPrompt: '',
        expectedOutputType: 'json',
      },
      timestamp: Date.now(),
    });
    if (this.simulateLatencyMs > 0) {
      await sleep(this.simulateLatencyMs);
    }
    if (this.simulateError) {
      throw new AIError(this.simulateError.message, this.simulateError.code, nextTraceId());
    }
    // Void `payload` — recorded via the `request` object above; the
    // shape guarantees `agents_routes` sees it in real dispatch.
    void payload;
    return { runId: `mock-run-${nextTraceId()}`, status: 'queued' };
  }

  async getAgentRun(runId: string): Promise<AgentRunResult> {
    if (this.simulateError) {
      throw new AIError(this.simulateError.message, this.simulateError.code, nextTraceId());
    }
    // If the test configured a specific run, return it verbatim.
    const configured = this.agentRuns.get(runId);
    if (configured !== undefined) return configured;
    // Otherwise a deterministic `completed` placeholder — matches the
    // "no polling under the mock" contract.
    return {
      runId,
      agentName: 'document_extract',
      status: 'completed',
      output: { fields: {}, missing_fields: [], indeterminate_fields: [] },
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Same signature as `AIClient.waitForAgentRun` but **no polling** —
   * returns immediately with the canned result. Under
   * `simulateAgentFailure`, throws `AgentRunFailedError` so a test can
   * exercise the `FallbackProxy.waitForAgentRun` propagate-through
   * branch.
   *
   * `opts` is honoured for type parity but has no runtime effect (there
   * is nothing to poll or time out).
   */
  async waitForAgentRun(runId: string, opts?: WaitForAgentRunOptions): Promise<AgentRunResult> {
    void opts;
    if (this.simulateError) {
      throw new AIError(this.simulateError.message, this.simulateError.code, nextTraceId());
    }
    if (this.simulateAgentFailure) {
      const cfg = this.simulateAgentFailure;
      const failRunId = cfg.runId ?? runId;
      throw new AgentRunFailedError(
        failRunId,
        `agent run ${failRunId} failed: ${cfg.error}`,
        cfg.output,
      );
    }
    return this.getAgentRun(runId);
  }

  async listAgents(): Promise<AgentCatalogEntry[]> {
    if (this.simulateError) {
      throw new AIError(this.simulateError.message, this.simulateError.code, nextTraceId());
    }
    return this.agentCatalog.slice();
  }

  /**
   * Same contract as `AIClient.withFallback` — and literally the same
   * implementation, since `FallbackProxy` is typed against `AIClientLike`.
   * A `simulateError`-configured mock therefore degrades exactly the way a
   * real outage does, which is what makes the SDK's mandated pattern
   * ("`withFallback` on every AI screen") testable against the mandated
   * test double.
   *
   * P3-S167 note: the fallback proxy's `waitForAgentRun` propagates
   * `AgentRunFailedError` rather than swallowing it — see the class
   * doc-comment in `errors.ts`. Configure `simulateAgentFailure` on
   * this mock to reach that branch in a test.
   */
  withFallback(fn: (err?: AIError) => void): FallbackProxy {
    return new FallbackProxy(this, fn);
  }
}
