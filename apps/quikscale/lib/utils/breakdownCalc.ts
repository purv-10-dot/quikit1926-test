/**
 * OPSP target distribution helper — owns the math for spreading a Projected
 * value across period cells (5 fiscal years, 4 quarters, 3 months).
 *
 * The helper intentionally keeps the legacy enum names
 * (`Cumulative | Standalone | CumulativeTillExit | Manual`) even after the
 * two-axis CategoryMaster rename. The DB stores the new `categoryType` value
 * `CumulativeTillEnd`; the modal code bridges via `categoryTypeToBreakdown`
 * before calling into this module. Keeping the legacy spelling here avoids
 * a cascade rename across every caller.
 *
 * Distribution rules:
 *   - Cumulative          → equal split; last cell absorbs residue so
 *                            sum === target.
 *   - CumulativeTillExit  → ramp; cell i = target * (i+1) / n, last === target.
 *   - Standalone          → every cell = target.
 *   - Manual              → returns null (caller must leave cells alone).
 *
 * `firstEditableIndex` carves out a frozen prefix (cells before the index
 * stay empty / 0); residue still lands on the final editable cell.
 */

export type BreakdownType =
  | "Cumulative"
  | "Standalone"
  | "CumulativeTillExit"
  | "Manual";

export type MeasurementUnit = "Number" | "Percentage" | "Currency";

export interface BreakdownOptions {
  measurementUnit: MeasurementUnit;
  /** First cell index the user can edit. Cells before this are left at 0. */
  firstEditableIndex?: number;
}

export const BREAKDOWN_TYPES: readonly BreakdownType[] = [
  "Cumulative",
  "Standalone",
  "CumulativeTillExit",
  "Manual",
] as const;

export const BREAKDOWN_LABELS: Record<BreakdownType, string> = {
  Cumulative: "Cumulative",
  Standalone: "Standalone",
  CumulativeTillExit: "Cumulative Till End",
  Manual: "Manual",
};

/* ───────────────────────── rounding ───────────────────────── */

/** True when the measurement unit prefers whole-number cell values. */
function isWholeUnit(u: MeasurementUnit): boolean {
  return u === "Number";
}

/** Round to the precision implied by the measurement unit. */
function roundTo(n: number, unit: MeasurementUnit): number {
  if (!Number.isFinite(n)) return 0;
  if (isWholeUnit(unit)) return Math.round(n);
  // Percentage + Currency: 2 decimals, banker-free.
  return Math.round(n * 100) / 100;
}

/* ───────────────────────── core ───────────────────────── */

/**
 * Distribute `target` across `n` cells according to `type`.
 *
 * Returns:
 *   - `number[]` of length `n` on success — sum/last-cell guarantee holds
 *     for Cumulative / CumulativeTillExit / Standalone.
 *   - `null` for `Manual` (caller should not write anything).
 */
export function calculateBreakdown(
  type: BreakdownType,
  target: number,
  n: number,
  opts: BreakdownOptions,
): number[] | null {
  if (type === "Manual") return null;
  if (!Number.isFinite(target) || n <= 0) return null;

  const unit = opts.measurementUnit;
  const firstEditable = Math.max(0, Math.min(opts.firstEditableIndex ?? 0, n));
  const editableCount = n - firstEditable;
  if (editableCount <= 0) return new Array(n).fill(0);

  if (type === "Standalone") {
    const cell = roundTo(target, unit);
    const out = new Array(n).fill(0);
    for (let i = firstEditable; i < n; i++) out[i] = cell;
    return out;
  }

  if (type === "Cumulative") {
    const per = target / editableCount;
    const out = new Array(n).fill(0);
    let running = 0;
    for (let i = firstEditable; i < n; i++) {
      const isLast = i === n - 1;
      // Last editable cell absorbs the residue so sum === target exactly.
      const raw = isLast ? target - running : per;
      const cell = roundTo(raw, unit);
      out[i] = cell;
      running += cell;
    }
    // Residue protection: if rounding nudged the running sum off, push the
    // delta onto the last cell.
    const delta = roundTo(target - running, unit);
    if (delta !== 0) out[n - 1] = roundTo(out[n - 1] + delta, unit);
    return out;
  }

  // CumulativeTillExit: ramp 1/n .. n/n. Last cell is always exactly target.
  if (type === "CumulativeTillExit") {
    const out = new Array(n).fill(0);
    for (let i = firstEditable; i < n; i++) {
      const editablePos = i - firstEditable + 1;
      const isLast = i === n - 1;
      const raw = isLast
        ? target
        : (target * editablePos) / editableCount;
      out[i] = roundTo(raw, unit);
    }
    // Force last cell to exact target (rounding can introduce a small delta).
    out[n - 1] = roundTo(target, unit);
    return out;
  }

  return null;
}
