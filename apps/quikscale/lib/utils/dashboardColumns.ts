/**
 * Column-visibility logic for the Dashboard KPI table.
 *
 * The KPI table renders TWO different owner columns:
 *   • `owner`    — the single owner of an INDIVIDUAL KPI (`KPI.owner` / `owner_user`).
 *   • `kpiOwner` — the multiple owners of a TEAM KPI (`KPI.ownerIds[]` → `owners[]`),
 *                  optionally with contribution percentages.
 *
 * The Dashboard's "Team" tab has a KPI Type toggle (`individual` | `team`) that
 * swaps which level of KPI the section lists. The owner column shown MUST match
 * that toggle, otherwise the owner renders blank ("—"):
 *   • Individual KPIs leave `ownerIds[]` empty (the owner lives in `owner`), so
 *     forcing the `kpiOwner` column on them shows nothing. This is exactly the
 *     bug that hid owners for KPIs linked under a Team KPI on the dashboard.
 *   • Team KPIs leave `owner` null (owners live in `ownerIds[]`).
 *
 * The "My Dashboard" (individual) tab hides BOTH owner columns — those rows are
 * always owned by the current user, so an owner column would be redundant.
 *
 * This returns only the STATIC hidden columns; the caller appends the
 * dynamically-hidden week columns (`hiddenWeekCols`) separately.
 */
export type DashboardTab = "individual" | "team";
export type DashboardKpiType = "individual" | "team";

export function dashboardKpiHiddenColumns(
  activeTab: DashboardTab,
  teamTabKpiType: DashboardKpiType,
): string[] {
  const base = ["_checkbox", "_log", "_id", "progress", "targetValue", "description", "teamHead"];

  // My Dashboard tab — single-user view; hide team + both owner columns.
  if (activeTab !== "team") {
    return [...base, "owner", "team", "kpiOwner"];
  }

  // Team tab — keep the `team` column, and show the owner column that matches
  // the KPI Type toggle (hide the other one).
  return teamTabKpiType === "team"
    ? [...base, "owner"] // team KPIs → show multi-owner `kpiOwner`
    : [...base, "kpiOwner"]; // individual KPIs → show single `owner`
}
