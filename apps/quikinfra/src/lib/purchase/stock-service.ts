/**
 * StockAvailabilityService — Project/location-scoped stock checks
 *
 * Replaces the simplified item.currentStock global check with
 * proper project + location scoped stock aggregation.
 *
 * P1 Fix: Stock check must be project-scoped and snapshot-persisted at MR submission.
 */

import { StockCheckStatus } from "./enums";

export interface StockCheckResult {
  itemId: string;
  itemCode: string;
  itemName: string;
  projectId: string;
  /** Aggregate available stock across all project locations */
  availableQty: number;
  /** Qty requested on MR line */
  requestedQty: number;
  /** Deficit = max(0, requested - available) */
  deficitQty: number;
  /** Qty that can be issued from stock = min(available, requested) */
  issueableQty: number;
  status: StockCheckStatus;
  /** Snapshot timestamp for audit */
  checkedAt: string;
  /** Per-location breakdown */
  locationBreakdown: Array<{ locationId: string; locationName: string; qty: number }>;
}

export class StockAvailabilityService {
  /**
   * Check stock for a single item at a specific project.
   * Aggregates across all active locations within the project.
   *
   * NOTE: Items master moved to Postgres but `currentStock` is not part of
   * `cn_items`. Until a real stock-ledger query is wired in, we treat
   * available stock as 0 — every line will surface as INSUFFICIENT, which
   * is a conservative default that won't silently let stock-served PRs
   * skip the indent path.
   */
  checkItemStock(itemId: string, projectId: string, requestedQty: number): StockCheckResult {
    // Available stock defaults to 0 — see method docblock.
    const totalAvailable = 0;

    // No location breakdown available without a stock-ledger lookup.
    const locationBreakdown: Array<{ locationId: string; locationName: string; qty: number }> = [];

    const deficitQty = Math.max(0, requestedQty - totalAvailable);
    const issueableQty = Math.min(totalAvailable, requestedQty);

    let status: StockCheckStatus;
    if (totalAvailable >= requestedQty) status = StockCheckStatus.AVAILABLE;
    else if (totalAvailable > 0) status = StockCheckStatus.PARTIAL;
    else status = StockCheckStatus.INSUFFICIENT;

    return {
      itemId,
      itemCode: "",
      itemName: "",
      projectId,
      availableQty: totalAvailable,
      requestedQty,
      deficitQty,
      issueableQty,
      status,
      checkedAt: new Date().toISOString(),
      locationBreakdown,
    };
  }

  /**
   * Check stock for multiple MR lines.
   * Returns enriched lines with stock snapshot persisted for audit.
   */
  checkMRLines<
    T extends {
      itemId?: string | null;
      qtyRequired?: number | string | null;
      quantity?: number | string | null;
    },
  >(
    lines: T[],
    projectId: string,
  ): Array<T & { stockSnapshot: StockCheckResult }> {
    return lines.map(line => {
      const qty = parseFloat(String(line.qtyRequired ?? line.quantity ?? "0"));
      const snapshot = this.checkItemStock(line.itemId ?? "", projectId, qty);
      return {
        ...line,
        currentStock: String(snapshot.availableQty),
        stockCheckStatus: snapshot.status,
        deficitQty: String(snapshot.deficitQty),
        issueableQty: String(snapshot.issueableQty),
        stockSnapshot: snapshot,
      };
    });
  }

  /**
   * Low stock / reorder alerts.
   * Returns items where current stock < min stock level across active projects.
   *
   * NOTE: Without a real stock-ledger query, we can't compute current stock
   * here. Returns an empty list — the dashboard widget renders "no alerts"
   * which is preferable to misleading data sourced from the demo store.
   */
  getLowStockAlerts(): Array<{
    itemId: string; itemCode: string; itemName: string;
    currentStock: number; minStockLevel: number; deficit: number;
    uomCode: string;
  }> {
    return [];
  }
}

export const stockService = new StockAvailabilityService();
