/**
 * Per-key token buckets for LLM calls — requests wait instead of failing.
 *
 * Why this exists (doc 17 gap G16):
 *   `geminiKeyPool` fails over to the next key on a 429. That is right for a
 *   genuine outage, but it means self-inflicted rate limiting burns the
 *   failover budget: fan out 25 chunk extractions across 3 keys with no
 *   limiter, all three trip 429, the pool raises `GeminiUnavailableError`, and
 *   a 4-hour meeting's extraction dies for no reason other than that we asked
 *   too fast.
 *
 *   So the ceiling is enforced BEFORE the call. A request that would exceed it
 *   waits its turn. Waiting is cheap; a failed run is not.
 *
 * Gemini limits both requests per minute and TOKENS per minute, and for long
 * transcripts the token limit binds first — a chunk call is ~5k input tokens,
 * so 6 concurrent chunks is ~31k tokens in flight. Both are enforced, and a
 * request must satisfy both.
 *
 * Scope, and honesty about it:
 *   State is per-process, in memory. That is exactly right for the QuikFlow
 *   worker, which is a single long-lived process and is where chunk fan-out
 *   actually runs (doc 17 section K). On Vercel serverless each instance keeps
 *   its own bucket, so the effective ceiling is per-instance — acceptable,
 *   because the serverless path only ever makes the small single-chunk (Daily
 *   Huddle) and L2 analysis calls. Do not rely on this for a distributed
 *   ceiling; if that is ever needed, the Redis limiter in
 *   `@quikit/shared/rateLimit` is where it belongs.
 *
 * Deterministic by construction: the clock and sleep are injectable, so every
 * behaviour here is unit-testable without real timers.
 */

export interface BucketLimits {
  /** Requests per minute, per key. */
  rpm: number;
  /** Tokens per minute, per key. Input + output, as the provider counts them. */
  tpm: number;
}

/**
 * Conservative defaults, env-tunable because the real ceiling depends on the
 * account tier and doc 17 open question Q9 records that we do not yet know it.
 * `AiUsageLog` plus the 429 counters below make the true limit measurable
 * within one real meeting — tune from data, not guesswork.
 */
export function limitsFromEnv(): BucketLimits {
  const rpm = Number(process.env.GEMINI_RPM_PER_KEY);
  const tpm = Number(process.env.GEMINI_TPM_PER_KEY);
  return {
    rpm: Number.isFinite(rpm) && rpm > 0 ? rpm : 15,
    tpm: Number.isFinite(tpm) && tpm > 0 ? tpm : 250_000,
  };
}

const WINDOW_MS = 60_000;

interface Window {
  /** Start of the current 60s window. */
  startedAt: number;
  requests: number;
  tokens: number;
}

/**
 * A fixed-window limiter for one key.
 *
 * Fixed window rather than true sliding: the provider's own limits are
 * fixed-window, so matching that shape avoids being stricter than necessary
 * while still never exceeding the ceiling.
 */
export class KeyBucket {
  private win: Window;
  /** Multiplier applied after a 429, halving effective throughput. */
  private penalty = 1;
  private penaltyUntil = 0;
  private observed429 = 0;

  constructor(
    readonly keyId: string,
    private limits: BucketLimits,
    private now: () => number = Date.now,
  ) {
    this.win = { startedAt: this.now(), requests: 0, tokens: 0 };
  }

  private roll(): void {
    const t = this.now();
    if (t - this.win.startedAt >= WINDOW_MS) {
      this.win = { startedAt: t, requests: 0, tokens: 0 };
    }
    if (this.penaltyUntil && t >= this.penaltyUntil) {
      this.penalty = 1;
      this.penaltyUntil = 0;
    }
  }

  private effective(): BucketLimits {
    return {
      rpm: Math.max(1, Math.floor(this.limits.rpm * this.penalty)),
      tpm: Math.max(1_000, Math.floor(this.limits.tpm * this.penalty)),
    };
  }

  /**
   * Milliseconds to wait before `estTokens` may be spent. 0 means go now.
   *
   * A single request larger than the whole per-minute token budget would
   * otherwise wait forever, so it is admitted at the start of a fresh window
   * instead: an oversized chunk then fails loudly at the provider rather than
   * hanging silently here. Chunk sizing (doc 17 section D.3) is what keeps
   * that from happening in the first place.
   */
  retryAfterMs(estTokens: number): number {
    this.roll();
    const lim = this.effective();

    const overRequests = this.win.requests + 1 > lim.rpm;
    const overTokens = this.win.tokens + estTokens > lim.tpm && this.win.tokens > 0;

    if (!overRequests && !overTokens) return 0;
    return Math.max(1, this.win.startedAt + WINDOW_MS - this.now());
  }

  /** Record an intended spend. Call immediately before the request. */
  reserve(estTokens: number): void {
    this.roll();
    this.win.requests += 1;
    this.win.tokens += Math.max(0, estTokens);
  }

  /**
   * Reconcile the estimate against what the provider actually billed, so the
   * window reflects reality rather than our 4-chars-per-token guess.
   */
  settle(estTokens: number, actualTokens: number): void {
    this.roll();
    this.win.tokens = Math.max(0, this.win.tokens - estTokens + actualTokens);
  }

  /**
   * Register a 429: halve effective throughput for one window, then recover.
   * This is the adaptive half of doc 17 section D.11 — it prevents a
   * thundering herd immediately after a limit is hit, which is exactly when a
   * naive retry loop makes things worse.
   */
  penalise(): void {
    this.observed429 += 1;
    this.penalty = Math.max(0.25, this.penalty / 2);
    this.penaltyUntil = this.now() + WINDOW_MS;
  }

  /** Snapshot for telemetry — surfaced by `reports/metrics`. */
  stats(): {
    keyId: string;
    requests: number;
    tokens: number;
    penalty: number;
    observed429: number;
  } {
    this.roll();
    return {
      keyId: this.keyId,
      requests: this.win.requests,
      tokens: this.win.tokens,
      penalty: this.penalty,
      observed429: this.observed429,
    };
  }
}

export class RateLimitTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitTimeoutError";
  }
}

/** Registry of buckets, one per API key, created on first use. */
export class RateLimiter {
  private buckets = new Map<string, KeyBucket>();

  constructor(
    private limits: BucketLimits = limitsFromEnv(),
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  bucket(keyId: string): KeyBucket {
    let b = this.buckets.get(keyId);
    if (!b) {
      b = new KeyBucket(keyId, this.limits, this.now);
      this.buckets.set(keyId, b);
    }
    return b;
  }

  /**
   * Wait until `keyId` can afford `estTokens`, then reserve it. Returns how
   * long we waited, for the `queueWaitMs` telemetry field.
   *
   * `maxWaitMs` bounds the wait so a badly misconfigured limit surfaces as a
   * clear timeout instead of a job that appears to hang.
   */
  async acquire(
    keyId: string,
    estTokens: number,
    opts: { maxWaitMs?: number; signal?: AbortSignal } = {},
  ): Promise<number> {
    const maxWait = opts.maxWaitMs ?? 120_000;
    const b = this.bucket(keyId);
    const started = this.now();

    for (;;) {
      if (opts.signal?.aborted) throw new Error("Aborted while rate-limited");

      const wait = b.retryAfterMs(estTokens);
      if (wait === 0) {
        b.reserve(estTokens);
        return this.now() - started;
      }
      if (this.now() - started + wait > maxWait) {
        throw new RateLimitTimeoutError(
          `Rate limit wait for key ${keyId} would exceed ${maxWait}ms ` +
            `(needs ${estTokens} tokens). Raise GEMINI_TPM_PER_KEY / ` +
            `GEMINI_RPM_PER_KEY, or lower EXTRACT_CONCURRENCY.`,
        );
      }
      await this.sleep(wait);
    }
  }

  settle(keyId: string, estTokens: number, actualTokens: number): void {
    this.bucket(keyId).settle(estTokens, actualTokens);
  }

  penalise(keyId: string): void {
    this.bucket(keyId).penalise();
  }

  stats(): ReturnType<KeyBucket["stats"]>[] {
    return [...this.buckets.values()].map((b) => b.stats());
  }
}

/**
 * Process-wide limiter. Shared deliberately: the ceiling is per API key, so
 * every caller in the process must contend for the same buckets or the limit
 * means nothing. Tests construct their own `RateLimiter` with an injected
 * clock rather than touching this.
 */
export const sharedRateLimiter = new RateLimiter();
