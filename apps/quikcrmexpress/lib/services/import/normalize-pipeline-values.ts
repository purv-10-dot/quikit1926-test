/**
 * Import-time normalization of the pipeline fields (stage / status / substatus)
 * and source, so LSQ-exported values land as VALID configured values instead of
 * being written raw.
 *
 * WHY: CrmExpress's LeadSquared exports use values that don't exactly equal the
 * tenant's configured pipeline values — e.g. stages carry extra spaces
 * ("Not Connected (New Lead)" vs configured "Not Connected(New Lead)"), and
 * sub-status values carry a numeric prefix ("1. No. Busy" vs configured
 * "No. Busy"). Written raw, those values are not pipeline-valid, so dispositions,
 * automations, and the stage->status->substatus cascade misbehave — the exact
 * problem the post-import contact_stage / contact_source migrations had to fix.
 *
 * WHAT: a conservative, tiered match of each incoming value against the tenant's
 * CONFIGURED list. It only ever snaps a value to something already configured, or
 * leaves it untouched + flags it. It NEVER invents a value and NEVER fuzzy-guesses
 * typos (e.g. it will not "correct" "Varified"->"Verified" — the config genuinely
 * contains both spellings as distinct entries).
 *
 * Match tiers (first hit wins), all validated against the real CrmExpress export:
 *   1. exact               — value already equals a configured value
 *   2. case-insensitive    — "mobile signup" vs "Mobile Signup"
 *   3. whitespace-normalized — collapse runs of space + drop the space before "("
 *                             ("Not Connected (New Lead)" -> "Not Connected(New Lead)")
 *   4. numeric-prefix strip — "1. No. Busy" -> "No. Busy" (LSQ sub-status codes)
 * No match -> value returned unchanged, and the field/value recorded as a flag so
 * the import summary can surface it (the row still imports; nothing blocks).
 *
 * On the real 5,245-row export this resolves ~99.9% of stage/status/substatus to
 * a configured value; the ~18 genuine non-matches (e.g. "Qualified with Tally")
 * are flagged, not forced.
 *
 * source has NO configured list (free-text column), so it is only case-folded
 * against the values ALREADY present for the tenant (dedupes "Mobile Signup" vs
 * "mobile signup"); an unseen source value passes through unchanged.
 */

const collapseWs = (s: string) => s.replace(/\s+/g, " ").trim();
// Whitespace-normalized key: lower + collapse runs of whitespace + drop the
// space immediately before an opening paren (the recurring LSQ spacing quirk).
const wsKey = (s: string) => collapseWs(s).toLowerCase().replace(/\s+\(/g, "(");
// Strip a leading "N. " (LSQ sub-status numbering) before matching.
const stripNumPrefix = (s: string) => s.replace(/^\s*\d+\.\s*/, "");

export interface PipelineMatcher {
  /** Snap an incoming value to a configured one, or return it unchanged. */
  match(raw: string): { value: string; matched: boolean };
}

/**
 * Build a matcher for one configured value list. Pure/among-list only: given the
 * configured values, returns a function that maps an incoming value to the
 * configured spelling when any tier matches.
 */
export function buildPipelineMatcher(configuredValues: string[]): PipelineMatcher {
  const exact = new Set(configuredValues);
  const byCi = new Map<string, string>();
  const byWs = new Map<string, string>();
  for (const c of configuredValues) {
    // First writer wins so we prefer the earliest-configured spelling on ties.
    const ci = c.trim().toLowerCase();
    if (!byCi.has(ci)) byCi.set(ci, c);
    const ws = wsKey(c);
    if (!byWs.has(ws)) byWs.set(ws, c);
  }

  return {
    match(raw: string) {
      const value = (raw ?? "").trim();
      if (value === "") return { value, matched: false };
      // 1. exact
      if (exact.has(value)) return { value, matched: true };
      // 2. case-insensitive
      const ci = byCi.get(value.toLowerCase());
      if (ci) return { value: ci, matched: true };
      // 3. whitespace-normalized (incl. " (" -> "(")
      const ws = byWs.get(wsKey(value));
      if (ws) return { value: ws, matched: true };
      // 4. numeric-prefix strip, then re-run ci + ws on the stripped form
      const stripped = stripNumPrefix(value);
      if (stripped !== value) {
        if (exact.has(stripped)) return { value: stripped, matched: true };
        const sci = byCi.get(stripped.toLowerCase());
        if (sci) return { value: sci, matched: true };
        const sws = byWs.get(wsKey(stripped));
        if (sws) return { value: sws, matched: true };
      }
      // No match — leave the value untouched; caller flags it.
      return { value, matched: false };
    },
  };
}

/** A single unmatched pipeline value, for the import warnings summary. */
export interface NormalizationFlag {
  field: "stage" | "status" | "substatus";
  value: string;
}

export interface PipelineConfig {
  stages: string[];
  statuses: string[];
  substatuses: string[];
}

/**
 * Normalize the pipeline fields on a resolved import row's `standard` map,
 * returning a new object. Matched values are snapped to the configured spelling;
 * unmatched values are left as-is and returned as flags.
 *
 * `source` is handled separately by the caller (case-fold vs existing values),
 * because it has no configured list.
 */
export function normalizePipelineFields(
  standard: Record<string, string>,
  matchers: { stage: PipelineMatcher; status: PipelineMatcher; substatus: PipelineMatcher },
): { standard: Record<string, string>; flags: NormalizationFlag[] } {
  const out = { ...standard };
  const flags: NormalizationFlag[] = [];
  (["stage", "status", "substatus"] as const).forEach((field) => {
    const raw = out[field];
    if (raw == null || raw === "") return;
    const { value, matched } = matchers[field].match(raw);
    out[field] = value;
    if (!matched) flags.push({ field, value: raw });
  });
  return { standard: out, flags };
}

/** Convenience: build all three matchers from a tenant's pipeline config. */
export function buildPipelineMatchers(cfg: PipelineConfig) {
  return {
    stage: buildPipelineMatcher(cfg.stages),
    status: buildPipelineMatcher(cfg.statuses),
    substatus: buildPipelineMatcher(cfg.substatuses),
  };
}

/**
 * Case-fold a source value against the set of source values ALREADY present for
 * the tenant, so "Mobile Signup" collapses onto an existing "mobile signup".
 * Unknown source values pass through unchanged (source is free-text; we never
 * reject it). Returns the (possibly snapped) value.
 */
export function normalizeSourceValue(raw: string, existingSources: string[]): string {
  const value = (raw ?? "").trim();
  if (value === "") return value;
  if (existingSources.includes(value)) return value; // exact
  const byCi = new Map<string, string>();
  for (const s of existingSources) {
    const ci = s.trim().toLowerCase();
    if (!byCi.has(ci)) byCi.set(ci, s);
  }
  return byCi.get(value.toLowerCase()) ?? value;
}
