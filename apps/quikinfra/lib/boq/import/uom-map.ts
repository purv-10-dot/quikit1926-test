/**
 * Unit-of-measure normaliser — shared by the Universal Import adapter.
 *
 * Construction BOQs use wildly inconsistent unit abbreviations: `cum`, `CUM`,
 * `cu.m`, `m³`, `cubic metre` all mean the same thing. This map collapses
 * every known variant to a single canonical uppercase token so downstream
 * aggregations, rate rollups, and DPR reconciliation stay consistent.
 *
 * Table sourced from AAKAR ERP BOQ Universal Import Engine Spec v1.0 §4.2.
 */

const UOM_VARIANTS: Record<string, string[]> = {
  CUM: ["cum", "m3", "m³", "cubm", "cum3", "cubicmeter", "cubicmetre"],
  SQM: ["sqm", "m2", "m²", "sqmm", "sqmeter", "sqmetre", "sft", "sqft"],
  RMT: ["rmt", "rm", "lm", "rlm", "runningmeter", "linealmeter"],
  NOS: ["nos", "no", "number", "each", "ea", "units", "unit", "pcs", "pieces"],
  KG:  ["kg", "kgs", "kilogram", "kilo"],
  MT:  ["mt", "mts", "ton", "tonne", "metricton", "te"],
  LTR: ["ltr", "lts", "litre", "liter", "ltrs", "l"],
  BAG: ["bag", "bags"],
  KME: ["kme", "km", "kms", "kilometer", "kilometre"],
  LS:  ["ls", "lump", "lumpsum", "job", "lot"],
  DAY: ["day", "days", "dy"],
  HOUR:["hr", "hrs", "hour", "hours"],
  SET: ["set", "sets"],
};

// Flattened lookup built once at module load.
const UOM_LOOKUP = new Map<string, string>();
for (const [canonical, variants] of Object.entries(UOM_VARIANTS)) {
  for (const v of variants) UOM_LOOKUP.set(v, canonical);
}

/** Flat set of canonical UOMs — used by classifyRow as a "looks like a leaf" signal. */
export const CANONICAL_UOMS = new Set(Object.keys(UOM_VARIANTS));

/**
 * Return the canonical UOM for `raw`, or `raw.toUpperCase()` if no variant
 * matches (preserves unknown units for user review rather than dropping them).
 */
export function normalizeUom(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim().toLowerCase().replace(/[.\s]/g, "");
  if (!s) return "";

  // Direct match
  const direct = UOM_LOOKUP.get(s);
  if (direct) return direct;

  // Prefix fuzzy match (e.g. "cum." after strip → "cum" → hit; "meter" → "m" prefix hits KME — so skip that)
  // Only run prefix match against variants ≥ 2 chars to avoid false positives.
  let result: string | null = null;
  UOM_LOOKUP.forEach((canonical, variant) => {
    if (result) return;
    if (variant.length >= 2 && (s === variant || (s.length >= 2 && s.startsWith(variant) && variant.length >= 3))) {
      result = canonical;
    }
  });
  if (result) return result;

  return String(raw).trim().toUpperCase();
}

/** True if `raw` (after normalisation) is one of our canonical UOMs. */
export function isKnownUom(raw: unknown): boolean {
  const n = normalizeUom(raw);
  return CANONICAL_UOMS.has(n);
}
