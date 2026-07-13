/**
 * Cell-level normalisation helpers shared by both adapters.
 *
 * Excel pulls out values as `string | number | null`. Both adapters need
 * to coerce, trim, strip currency symbols, and detect emptiness with the
 * same semantics — otherwise rows ingested via different modes would
 * round-trip differently.
 */

export function trimStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Empty after trim? */
export function isBlank(v: unknown): boolean {
  return trimStr(v).length === 0;
}

/** Cell is blank OR whitespace OR explicit null. */
export function isCellEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

/** Lowercase + collapse whitespace + strip newlines (for unit cells). */
export function normaliseUnit(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Strip newlines, max 1000 chars (descriptions). */
export function normaliseDescription(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().substring(0, 1000);
}

/** Truncate to 200 chars (display name). */
export function truncateName(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().substring(0, 200);
}

/**
 * Parse a numeric cell. Strips ₹/$/commas/whitespace, accepts negatives,
 * returns NaN on failure. Empty/null returns NaN (caller distinguishes
 * "missing" from "zero" via `isCellEmpty` if needed).
 */
export function parseNumeric(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return NaN;
  const cleaned = s
    .replace(/[₹$€£,\s]/g, "")
    .replace(/[^\d.\-eE+]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return NaN;
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

/**
 * Count dots in a BOQ ref for depth calculation.
 *   "1"      → 0
 *   "1.2"    → 1
 *   "1.2.3a" → 2 (alphanumeric suffix stripped)
 *   ""       → 0
 *
 * Caller is responsible for capping depth to the schema max (5).
 */
export function dotDepth(ref: string): number {
  if (!ref) return 0;
  // Strip a single trailing alphanumeric suffix (a/b/c, i/ii/iii, etc.)
  const cleaned = ref.replace(/[a-zA-Z]+$/, "");
  if (!cleaned) return 0;
  return (cleaned.match(/\./g) || []).length;
}

/**
 * Strip a single trailing alphanumeric suffix from a ref. Used when
 * resolving parents — "1.2.3a" and "1.2.3b" share parent "1.2".
 */
export function stripRefSuffix(ref: string): string {
  return ref.replace(/[a-zA-Z]+$/, "");
}

/**
 * Compute the "prefix parent" of a dotted ref by lopping the last segment.
 *   "1.2.3.4" → "1.2.3"
 *   "1"       → null
 *   "4.1.1.4a" → "4.1.1"  (trailing letter stripped first)
 */
export function prefixParent(ref: string): string | null {
  if (!ref) return null;
  const cleaned = stripRefSuffix(ref);
  const idx = cleaned.lastIndexOf(".");
  if (idx <= 0) return null;
  return cleaned.substring(0, idx);
}

/** True if the cell holds a header label like "S.No." (with or without dots/spaces). */
export function isHeaderLabel(v: unknown, candidates: string[]): boolean {
  const s = trimStr(v).toLowerCase().replace(/[\s.]+/g, "");
  return candidates.some((c) => s === c.toLowerCase().replace(/[\s.]+/g, ""));
}
