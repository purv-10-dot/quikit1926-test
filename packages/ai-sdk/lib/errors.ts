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
