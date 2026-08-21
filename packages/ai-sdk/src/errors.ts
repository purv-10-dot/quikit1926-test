export class AIError extends Error {
  public readonly code: string;
  public readonly traceId?: string;
  public readonly status?: number;

  constructor(message: string, code: string, traceId?: string, status?: number) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.traceId = traceId;
    this.status = status;
    Object.setPrototypeOf(this, AIError.prototype);
  }
}

export class AITimeoutError extends AIError {
  constructor(message: string, traceId?: string) {
    super(message, 'TIMEOUT', traceId);
    this.name = 'AITimeoutError';
    Object.setPrototypeOf(this, AITimeoutError.prototype);
  }
}

export class AIValidationError extends AIError {
  constructor(message: string, code = 'VALIDATION_ERROR', traceId?: string, status?: number) {
    super(message, code, traceId, status);
    this.name = 'AIValidationError';
    Object.setPrototypeOf(this, AIValidationError.prototype);
  }
}

/**
 * Thrown by `waitForAgentRun` when the polled run reaches terminal `failed`
 * status. Carries the run id and — crucially — the run's `output` (a failed
 * cross-cutting run still surfaces structured failure detail alongside its
 * `error`; see AG3 correction #3, e.g. `document_analysis` on a scanned PDF
 * returns `{reason: "no_extractable_text", next_action: "use_rag", ...}`).
 *
 * `FallbackProxy.waitForAgentRun` deliberately DOES NOT swallow this error
 * — a failed run is a successful call to the server (definitive terminal
 * answer, not a transport blip), and callers must handle it explicitly.
 * Falling back would erase the server's verdict and its structured detail
 * into an indistinguishable `undefined`, hiding the whole reason the caller
 * would want to act on the failure. Only genuine transport failures
 * (`AIError` / `AITimeoutError`) fall back on the `waitForAgentRun` path.
 */
export class AgentRunFailedError extends AIError {
  public readonly runId: string;
  public readonly runOutput: Record<string, unknown> | null;

  constructor(
    runId: string,
    message: string,
    output: Record<string, unknown> | null,
    traceId?: string,
  ) {
    super(message, 'AGENT_RUN_FAILED', traceId);
    this.name = 'AgentRunFailedError';
    this.runId = runId;
    this.runOutput = output;
    Object.setPrototypeOf(this, AgentRunFailedError.prototype);
  }
}
