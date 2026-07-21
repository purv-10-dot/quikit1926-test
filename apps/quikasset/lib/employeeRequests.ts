/**
 * Pure helpers for the unified "Employee Requests" admin queue, which shows
 * AstAssetRequest and AstRepairRequest rows together. DB-free and DOM-free so
 * the merge/sort/filter/search + action-routing logic is unit-testable; the page
 * is a thin renderer over these.
 *
 * The row keeps the ORIGINAL typed DTO (`raw`) so the existing per-type dialogs
 * (FulfilDialog needs an AssetRequest, SendToRepairDialog a RepairRequest) can be
 * reused unchanged — nothing is flattened away.
 */
import type { AssetRequest, AssetRequestPriority } from "@/types/assetRequest";
import type { RepairRequest, RepairRequestUrgency } from "@/types/repairRequest";

export type RequestKind = "asset" | "repair";
export type RequestFilter = "all" | RequestKind;

/** A shared severity scale — both priority and urgency use Low/Medium/High/Urgent. */
export type Severity = AssetRequestPriority & RepairRequestUrgency;

export type EmployeeRequestRow =
  | { kind: "asset"; id: string; createdAt: string; raw: AssetRequest }
  | { kind: "repair"; id: string; createdAt: string; raw: RepairRequest };

/**
 * Attention bucket for queue ordering, derived from what the row can be acted on
 * (so it never drifts from `rowActions`):
 *   0 — needs a decision (Approve/Reject)         → top
 *   1 — needs fulfilment (Assign / Send to Repair) → middle
 *   2 — done / no action (Rejected/Cancelled/Fulfilled, and asset Draft) → bottom
 */
export function statusRank(row: EmployeeRequestRow): number {
  const actions = rowActions(row);
  if (actions.includes("decide")) return 0;
  if (actions.includes("asset-assign") || actions.includes("repair-send")) return 1;
  return 2;
}

/**
 * Merge both request lists into one queue, ordered so what needs attention rises:
 * by attention bucket first (needs-decision → needs-fulfilment → done), then
 * newest-first within each bucket.
 */
export function normalizeRows(
  assetRequests: AssetRequest[],
  repairRequests: RepairRequest[],
): EmployeeRequestRow[] {
  const rows: EmployeeRequestRow[] = [
    ...assetRequests.map((r): EmployeeRequestRow => ({ kind: "asset", id: r.id, createdAt: r.createdAt, raw: r })),
    ...repairRequests.map((r): EmployeeRequestRow => ({ kind: "repair", id: r.id, createdAt: r.createdAt, raw: r })),
  ];
  return rows.sort((a, b) => {
    const byRank = statusRank(a) - statusRank(b);
    if (byRank !== 0) return byRank;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** Requester display fields (both DTOs resolve these via the identity bridge). */
export function requesterName(row: EmployeeRequestRow): string {
  return row.raw.requesterName ?? row.raw.requesterUserId;
}
export function requesterCode(row: EmployeeRequestRow): string | null {
  return row.raw.requesterEmployeeId ?? null;
}

/** Details column: title + subtitle, type-appropriate. */
export function detailTitle(row: EmployeeRequestRow): string {
  return row.kind === "asset" ? row.raw.itemType : (row.raw.assetName ?? row.raw.assetId);
}
export function detailSubtitle(row: EmployeeRequestRow): string {
  return row.kind === "asset" ? (row.raw.baseCategoryName ?? "") : row.raw.issueTitle;
}

/** Priority (asset) or urgency (repair) — same Low/Medium/High/Urgent scale. */
export function severity(row: EmployeeRequestRow): Severity {
  return (row.kind === "asset" ? row.raw.priority : row.raw.urgency) as Severity;
}

export function statusOf(row: EmployeeRequestRow): string {
  return row.raw.status;
}

/** Type-filter predicate for the All / Asset / Repair toggle. */
export function matchesType(row: EmployeeRequestRow, filter: RequestFilter): boolean {
  return filter === "all" || row.kind === filter;
}

/** Search predicate — requester name or the item/asset text of the row. */
export function matchesSearch(row: EmployeeRequestRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields =
    row.kind === "asset"
      ? [row.raw.requesterName, row.raw.itemType, row.raw.baseCategoryName]
      : [row.raw.requesterName, row.raw.assetName, row.raw.assetCode, row.raw.issueTitle];
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

/**
 * Which action controls a row shows, driven purely by (kind, status):
 *   - "decide"        → Approve + Reject (a still-pending request)
 *   - "asset-assign"  → Assign (an approved asset request → FulfilDialog)
 *   - "repair-send"   → Send to Repair (an approved repair request → SendToRepairDialog)
 *   - "reject-backout"→ a lone Reject, to back out an approval before fulfilment
 * Terminal rows (Rejected/Fulfilled/Cancelled, and asset Draft) return [].
 */
export type RowAction = "decide" | "asset-assign" | "repair-send" | "reject-backout";

export function rowActions(row: EmployeeRequestRow): RowAction[] {
  const s = row.raw.status;
  if (row.kind === "asset") {
    if (s === "Submitted" || s === "PendingApproval") return ["decide"];
    if (s === "Approved") return ["asset-assign", "reject-backout"];
    if (s === "PartiallyFulfilled") return ["asset-assign"];
    return [];
  }
  // repair
  if (s === "Submitted") return ["decide"];
  if (s === "Approved") return ["repair-send", "reject-backout"];
  return [];
}

/** The base API path for a row's decision/fulfil endpoints, by type. */
export function apiBase(row: EmployeeRequestRow): string {
  return row.kind === "asset" ? "/api/asset-requests" : "/api/repair-requests";
}
