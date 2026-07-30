/**
 * Structured application logger.
 *
 * Ports the *behaviour* of the legacy NestJS `AppLoggerService`
 * (QuikSkillsbackend/src/logger/app-logger.service.ts) without its transport:
 * the old service wrote winston + winston-daily-rotate-file into `./logs`,
 * which is meaningless on the serverless target — there is no writable
 * persistent disk, and the platform already captures and indexes stdout/stderr.
 * So the file transports are dropped and every record is emitted as a single
 * line of JSON on the console, which the platform log pipeline can parse and
 * query the same way it queried the rotated files.
 *
 * What IS preserved from the old service:
 *   - level floor of `info` in production, `debug` everywhere else
 *   - `errors({ stack: true })`-style error serialization
 *   - stacks are withheld in production (the old prod format never printed the
 *     `stack` field; only the dev printf branch did)
 *   - JSON output in production
 *   - arbitrary structured context merged into the record, which is where the
 *     old `requestId` / `tenantId` / `userId` AsyncLocalStorage fields land.
 *     Next.js route handlers already thread a requestId explicitly
 *     (`route()` in lib/http.ts), so no AsyncLocalStorage is needed — pass it
 *     in as context, or bind it once with `logger.child({ requestId })`.
 *
 * Dependency-free and side-effect-free at import, so it is safe to import from
 * any route handler, service or script.
 */

/* eslint-disable no-console */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Arbitrary structured fields merged into the emitted record. */
export type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Minimum level to emit. `LOG_LEVEL` wins when it names a known level
 * (`debug|info|warn|error|silent`); otherwise production floors at `info` and
 * every other environment at `debug` — same rule as the old winston instance.
 * Read per call rather than cached at import so tests and scripts can flip it.
 */
function minimumLevel(): LogLevel | 'silent' {
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (raw && raw in LEVEL_WEIGHT) return raw as LogLevel | 'silent';
  return isProduction() ? 'info' : 'debug';
}

/**
 * Error → plain object. `stack` is included ONLY outside production, matching
 * the old logger, which printed the stack in the dev printf format and left it
 * out of the production JSON format.
 */
export function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message };
    if (!isProduction() && err.stack) out.stack = err.stack;
    // Preserve the common enriched-error fields callers attach (ApiError etc.).
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (statusCode !== undefined) out.statusCode = statusCode;
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
  }
  return err;
}

/**
 * JSON.stringify replacer: serializes Errors, tolerates BigInt, and breaks
 * cycles so the logger can never throw on a hostile or self-referential value.
 */
function makeReplacer() {
  const seen = new WeakSet<object>();
  return function replacer(this: unknown, _key: string, value: unknown): unknown {
    if (value instanceof Error) return serializeError(value);
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function') return undefined;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

function toLine(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record, makeReplacer());
  } catch {
    // Last resort — never let logging break the request.
    return JSON.stringify({
      level: record.level ?? 'error',
      msg: String(record.msg ?? ''),
      timestamp: new Date().toISOString(),
      logSerializationFailed: true,
    });
  }
}

function write(level: LogLevel, line: string): void {
  // error/warn → stderr, everything else → stdout.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function emit(level: LogLevel, msg: string, context?: LogContext, bound?: LogContext): void {
  try {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel()]) return;
    const record: Record<string, unknown> = {
      level,
      msg,
      timestamp: new Date().toISOString(),
      ...(bound || {}),
      ...(context || {}),
    };
    write(level, toLine(record));
  } catch {
    // A logger that throws is worse than a logger that loses a line.
  }
}

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
  /** Returns a logger that merges `bindings` into every record (e.g. requestId). */
  child(bindings: LogContext): Logger;
}

function createLogger(bound: LogContext = {}): Logger {
  return {
    debug: (msg, context) => emit('debug', msg, context, bound),
    info: (msg, context) => emit('info', msg, context, bound),
    warn: (msg, context) => emit('warn', msg, context, bound),
    error: (msg, context) => emit('error', msg, context, bound),
    child: (bindings) => createLogger({ ...bound, ...bindings }),
  };
}

export const logger: Logger = createLogger();

/* ------------------------------------------------------------------ */
/* redactSensitive — ported from                                       */
/* QuikSkillsbackend/src/logger/sensitive-data.util.ts                 */
/* ------------------------------------------------------------------ */

/**
 * Field list copied verbatim from the legacy util.
 *
 * One correction: the legacy util compared an incoming key *after* stripping
 * `-`/`_` against this list *unstripped*, so its `access_token`,
 * `refresh_token`, `api_key` and `aws_secret_access_key` entries could never
 * match anything — an `access_token` field normalized to `accesstoken`, which
 * was not in the set, and was logged in the clear. Normalizing both sides makes
 * those four entries do what they were always meant to do. The list itself is
 * unchanged; nothing that used to be redacted stops being redacted.
 */
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_]/g, '');

const SENSITIVE_KEYS = new Set(
  [
    'password',
    'newpassword',
    'oldpassword',
    'confirmpassword',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'secret',
    'otp',
    'otpcode',
    'apikey',
    'api_key',
    'creditcard',
    'cardnumber',
    'cvv',
    'ssn',
    'awssecretaccesskey',
    'aws_secret_access_key',
  ].map(normalizeKey),
);

export const REDACTED = '[REDACTED]';

/**
 * Recursively replace the value of any sensitive-looking key with `[REDACTED]`.
 *
 * Semantics are those of the legacy util: primitives (including strings) pass
 * through untouched, arrays are mapped element-wise, and objects are rebuilt
 * key by key — a matching key is redacted whole, a nested object recurses.
 * The only addition is a cycle guard, because this now runs on request bodies
 * supplied by unauthenticated browsers and must not be able to hang the
 * process; acyclic input behaves exactly as it did before.
 */
export function redactSensitive(obj: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (seen.has(obj as object)) return '[Circular]';
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      redacted[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value, seen);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export default logger;
