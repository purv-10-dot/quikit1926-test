/**
 * Shared KPI-diffing logic for the Phase 3 snapshot comparison feature (see
 * PHASE_LOG.md). Used by both /reports/compare (client-side render) and
 * lib/insights/buildComparisonEmail.ts (server-side email), so the two never
 * disagree on how a delta is computed — the same drift risk documented at
 * the top of buildEmailReport.ts for the live report.
 *
 * Input is always two already-fetched snapshot KPI lists (DashboardData's
 * `kpis: KPIMetric[]`) — this module never fetches anything.
 */

export interface SnapshotKpi {
  label: string;
  value: string;
  rawValue: number;
  unit: "number" | "currency" | "shortNumber";
}

export interface ComparisonKpiRow {
  label: string;
  aValue: string | null;
  bValue: string | null;
  /** Signed percent change from A → B. null when A is 0/missing (can't divide) or the KPI is missing from either snapshot. */
  deltaPct: number | null;
}

/**
 * Pairs up KPIs that appear in both snapshots by label. A KPI present in
 * only one snapshot (e.g. a platform connected after A was taken) is
 * skipped — a delta needs both sides, and a fabricated 100%/-100% swing
 * would misrepresent "not tracked yet" as "went to/from zero".
 */
export function computeKpiDeltas(a: SnapshotKpi[], b: SnapshotKpi[]): ComparisonKpiRow[] {
  const bByLabel = new Map(b.map((k) => [k.label, k]));
  const rows: ComparisonKpiRow[] = [];

  for (const ak of a) {
    const bk = bByLabel.get(ak.label);
    if (!bk) continue;
    const deltaPct = ak.rawValue !== 0
      ? ((bk.rawValue - ak.rawValue) / Math.abs(ak.rawValue)) * 100
      : null;
    rows.push({ label: ak.label, aValue: ak.value, bValue: bk.value, deltaPct });
  }

  return rows;
}
