import { FallbackProxy, assertStreamable } from './client';
import { AIError } from './errors';
import type {
  AIClientLike,
  AIExecuteRequest,
  AIExecuteResponse,
  AIStreamOptions,
  MockCall,
  StreamTokenCallback,
} from './types';

interface MockConfig {
  defaultText?: string;
  defaultStructured?: Record<string, unknown>;
  responses?: Map<string, Partial<AIExecuteResponse>>;
  simulateLatencyMs?: number;
  simulateError?: { code: string; message: string };
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

  constructor(config?: MockConfig) {
    this.defaultText = config?.defaultText ?? 'Mock AI response.';
    this.defaultStructured = config?.defaultStructured ?? {};
    this.responses = config?.responses ?? new Map();
    this.simulateLatencyMs = config?.simulateLatencyMs ?? 0;
    this.simulateError = config?.simulateError;
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

  /**
   * Same contract as `AIClient.withFallback` — and literally the same
   * implementation, since `FallbackProxy` is typed against `AIClientLike`.
   * A `simulateError`-configured mock therefore degrades exactly the way a
   * real outage does, which is what makes the SDK's mandated pattern
   * ("`withFallback` on every AI screen") testable against the mandated
   * test double.
   */
  withFallback(fn: (err?: AIError) => void): FallbackProxy {
    return new FallbackProxy(this, fn);
  }
}
