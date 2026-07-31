/**
 * Shared shapes for pages with status tabs (Purchase Requisitions, Indents,
 * POs, GRN, Material Issues, Stock Transfer, Gate Pass, Good Return, Stock
 * Reconciliation, RFQs, …).
 *
 * Tab counts and row filtering are both server-side now — routes expose a
 * `?counts=1` GROUP BY mode and the active tab is pushed into the query — so
 * these are declaration-only. `useServerTabList` consumes them.
 *
 * `TabSpec.matches` remains the escape hatch for tabs that don't map to a
 * single `status` value (e.g. "Stock Available" keys off
 * `stockCheckSummary === "ALL_AVAILABLE"`).
 */

export interface TabSpec<T = unknown> {
  key: string;
  label: string;
  matches?: (row: T) => boolean;
}

export interface TabWithCount {
  key: string;
  label: string;
  count: number;
}

