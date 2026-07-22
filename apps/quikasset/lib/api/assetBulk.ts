/**
 * Pure helpers for bulk asset creation (the Add-form "Quantity" flow). No DB/fs
 * imports, so this is safe to use on both the client (pre-submit checks) and the
 * server (the /api/assets/bulk route).
 */

/** Max units creatable in one bulk submit. */
export const MAX_BULK_QUANTITY = 50;

export type BulkUnit = { itemCode: string; serialNumber: string };

/**
 * First duplicate WITHIN a batch — checked by itemCode, then serialNumber — or
 * null if the batch is internally unique. Values are trimmed; blanks are ignored
 * (missing values are caught by required-field checks). Row numbers are 1-based
 * for user-facing messages.
 */
export function findIntraBatchDuplicate(
  units: BulkUnit[],
): { field: "itemCode" | "serialNumber"; value: string; rows: number[] } | null {
  const scan = (pick: (u: BulkUnit) => string, field: "itemCode" | "serialNumber") => {
    const seen = new Map<string, number[]>();
    units.forEach((u, i) => {
      const v = pick(u).trim();
      if (!v) return;
      seen.set(v, [...(seen.get(v) ?? []), i + 1]);
    });
    for (const [value, rows] of seen) if (rows.length > 1) return { field, value, rows };
    return null;
  };
  return scan((u) => u.itemCode, "itemCode") ?? scan((u) => u.serialNumber, "serialNumber");
}
