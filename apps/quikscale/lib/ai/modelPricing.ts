/**
 * LLM price table — the only place a token count becomes a dollar figure.
 *
 * Why this exists:
 *   `AiUsageLog.costUsd` has to be written at call time. The provider does not
 *   return a price, only token counts, so cost is a local multiplication and
 *   the rates have to live somewhere auditable. Keeping them in one table (as
 *   opposed to inline in the gateway) means a price change is a one-line diff
 *   with a dated comment, and a model we have no rate for is loud rather than
 *   silently free.
 *
 * Rates are USD per 1,000,000 tokens, per Google's published Gemini API
 * pricing. VERIFY BEFORE RELYING ON COST REPORTS — these are point-in-time
 * figures and Google revises them; `docs/17` §O treats cost as directional.
 *
 * Cached input tokens bill at a large discount, which is why the gateway keeps
 * the prompt prefix stable (doc 17 §D.3) and why `cachedTokens` is a separate
 * field rather than being folded into `inputTokens`.
 */

export interface ModelRate {
  /** USD per 1M fresh (uncached) input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** USD per 1M input tokens served from the provider's context cache. */
  cachedInputPerMTok?: number;
  /** Free-form note — tier, date the rate was checked, caveats. */
  note?: string;
}

/**
 * Keyed on the model id as sent to the provider. Lookup is longest-prefix
 * (see `rateFor`) so a dated or suffixed id — `gemini-3.6-flash-002`,
 * `gemini-2.5-flash-preview-05-20` — resolves to its family's rate instead of
 * falling through to zero.
 */
export const MODEL_PRICING: Record<string, ModelRate> = {
  "gemini-3.6-flash": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cachedInputPerMTok: 0.075,
    note: "default extraction model (GEMINI_MODEL); rates checked 2026-08",
  },
  "gemini-3.6-pro": {
    inputPerMTok: 2.5,
    outputPerMTok: 15.0,
    cachedInputPerMTok: 0.625,
    note: "candidate GEMINI_MODEL_ANALYSIS; L2 analysis only (~4k tokens in)",
  },
  "gemini-2.5-flash": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cachedInputPerMTok: 0.075,
    note: "retired for new accounts — see geminiKeyPool.ts; kept so historical rows price correctly",
  },
  "gemini-2.5-pro": {
    inputPerMTok: 1.25,
    outputPerMTok: 10.0,
    cachedInputPerMTok: 0.3125,
  },
  "gemini-2.0-flash": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    cachedInputPerMTok: 0.025,
  },
  "gemini-embedding": {
    inputPerMTok: 0.15,
    outputPerMTok: 0,
    note: "embeddings produce no output tokens; ~2 orders of magnitude cheaper than generation",
  },
};

/** Models we have deliberately not priced, to keep the warning quiet for them. */
const UNPRICED_OK = new Set<string>();

const warned = new Set<string>();

/**
 * Resolve a model id to a rate by longest matching prefix.
 *
 * Returns `null` for an unknown model. Callers must treat that as "cost
 * unknown" (store 0 and carry on) rather than failing the request — an
 * unpriced model is an accounting gap, never a reason to drop a report the
 * user is waiting for. The gap is logged once per model per process.
 */
export function rateFor(model: string): ModelRate | null {
  const id = model.trim().toLowerCase();

  const exact = MODEL_PRICING[id];
  if (exact) return exact;

  let best: { key: string; rate: ModelRate } | null = null;
  for (const [key, rate] of Object.entries(MODEL_PRICING)) {
    if (id.startsWith(key) && (!best || key.length > best.key.length)) {
      best = { key, rate };
    }
  }
  if (best) return best.rate;

  if (!UNPRICED_OK.has(id) && !warned.has(id)) {
    warned.add(id);
    console.warn(
      `[ai:pricing] no rate for model "${model}" — cost will be recorded as 0. ` +
        `Add it to MODEL_PRICING in lib/ai/modelPricing.ts.`,
    );
  }
  return null;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  /** Subset of `inputTokens` that the provider served from cache. */
  cachedTokens?: number;
}

/**
 * Cost in USD for one call.
 *
 * `cachedTokens` is treated as a subset of `inputTokens` — that is how Gemini
 * reports it — so the fresh portion is `inputTokens - cachedTokens`. Clamped at
 * zero because a provider that reports more cached than total input should
 * produce a free call, not a negative one.
 *
 * Returned unrounded: `Decimal(10,6)` in Postgres does the rounding, and
 * rounding here would lose real signal on sub-cent extraction calls.
 */
export function costUsd(model: string, counts: TokenCounts): number {
  const rate = rateFor(model);
  if (!rate) return 0;

  const cached = Math.max(0, Math.min(counts.cachedTokens ?? 0, counts.inputTokens));
  const fresh = Math.max(0, counts.inputTokens - cached);

  const cachedRate = rate.cachedInputPerMTok ?? rate.inputPerMTok;

  return (
    (fresh / 1_000_000) * rate.inputPerMTok +
    (cached / 1_000_000) * cachedRate +
    (Math.max(0, counts.outputTokens) / 1_000_000) * rate.outputPerMTok
  );
}

/**
 * Rough token estimate for text, used for planning rather than billing:
 * chunk sizing (doc 17 §D.3) and the token bucket's pre-flight reservation,
 * both of which need a number BEFORE a call happens.
 *
 * ~4 characters per token holds well for English prose. Meeting transcripts
 * skew slightly denser because of speaker labels and timestamps, so this reads
 * a little low — which is the safe direction for a rate-limit reservation.
 *
 * Never use this for cost: `usageMetadata` from the provider is authoritative.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
