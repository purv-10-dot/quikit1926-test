/**
 * Shared tab-bucketing helpers.
 *
 * Pages with status tabs (Purchase Requisitions, Indents, POs, GRN,
 * Material Issues, Stock Transfer, Gate Pass, Good Return, Stock
 * Reconciliation, RFQs, …) all need two things:
 *   1. A count badge per tab (e.g. "Draft 3 · Pending Approval 5").
 *   2. The visible rows filtered to whichever tab is active.
 *
 * Doing this server-side per tab would mean N+1 queries (one for the
 * active tab plus one for every count badge). The pragmatic shape used
 * everywhere: fetch the unfiltered list once, derive both counts and
 * the visible slice from the same in-memory array via these helpers.
 *
 * `TabSpec.matches` is the escape hatch for tabs that don't map to a
 * single `status` value — e.g. "Stock Available" filters PRs by
 * `stockCheckSummary === "ALL_AVAILABLE"`, not by status. When
 * `matches` is omitted, the helper falls back to a case-insensitive
 * match on the row's `status` field against the tab's `key`.
 */

export interface TabSpec {
  key: string;
  label: string;
  matches?: (row: any) => boolean;
}

export interface TabWithCount {
  key: string;
  label: string;
  count: number;
}

const ALL_KEY = "all";

function defaultMatcher(tabKey: string) {
  return (row: any) =>
    String(row?.status ?? "").toLowerCase() === tabKey.toLowerCase();
}

/**
 * Build the `tabs` array for `<TabBar>` with a populated `count` per
 * entry. The "all" tab gets the total row count; every other tab is
 * counted via its `matches` predicate (or the default status matcher).
 */
export function buildTabCounts(
  rows: any[] | undefined,
  tabs: TabSpec[],
): TabWithCount[] {
  const data = rows ?? [];
  return tabs.map((t) => {
    if (t.key === ALL_KEY) return { key: t.key, label: t.label, count: data.length };
    const match = t.matches ?? defaultMatcher(t.key);
    return { key: t.key, label: t.label, count: data.filter(match).length };
  });
}

/**
 * Slice the unfiltered list down to the active tab's rows. Mirror of
 * `buildTabCounts` so the visible table and the count badge agree
 * row-for-row.
 */
export function filterByTab<T>(
  rows: T[] | undefined,
  activeTab: string,
  tabs: TabSpec[],
): T[] {
  const data = rows ?? [];
  if (activeTab === ALL_KEY) return data;
  const tab = tabs.find((t) => t.key === activeTab);
  const match = tab?.matches ?? defaultMatcher(activeTab);
  return data.filter(match);
}
