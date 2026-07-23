/**
 * Pure helpers for the BOQ Import drawer.
 *
 * Extracted verbatim from BOQImportDrawer.tsx as part of the god-file
 * decomposition. No React, no side effects.
 */

import type { NormalizedBoqRow, SFParent } from "./types";
import { NO_IMPORT_PERMISSION_MSG } from "./constants";

export const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Flatten the Self-Fill tree into NormalizedBoqRow[] for the import pipeline.
 *
 * Numbering follows the existing convention:
 *   parent     → "1", "2"
 *   child leaf → "1.1", "1.2"    (isGroup=false, depth=1, has qty/rate)
 *   child grp  → "1.1", "1.2"    (isGroup=true,  depth=1, no qty/rate)
 *   line item  → "1.1.1"         (isGroup=false, depth=2, under a child group)
 *
 * A child can be either a leaf (direct qty/rate, no sub-items) or a group
 * (contains line items). This mirrors the real BOQ where parents can have
 * leaf children directly (e.g. 2.2, 2.6) OR group children with sub-leaves
 * (e.g. 2.7 → 2.7.1).
 */
export function flattenSelfFill(
  parents: SFParent[],
  category: string,
): NormalizedBoqRow[] {
  const rows: NormalizedBoqRow[] = [];
  let rowNum = 1;

  // BOQ No resolver: override wins, else 1-based position.
  // Accepts full dotted override ("2.6") or last-segment only ("6").
  const resolveSegment = (override: string, position: number): string => {
    const t = override.trim();
    if (!t) return String(position);
    // if user typed a dotted path, use its last segment here (full path reconstructed below)
    const parts = t.split(".");
    return parts[parts.length - 1] || String(position);
  };

  parents.forEach((parent, pIdx) => {
    const parentNo = resolveSegment(parent.boqNoOverride, pIdx + 1);

    const hasContent =
      parent.displayName.trim() ||
      parent.children.some(
        (c) =>
          c.displayName.trim() ||
          (c.mode === "group" &&
            c.lineItems.some((li) => li.displayName.trim())),
      );
    if (!hasContent) return;

    rows.push({
      category,
      sourceSheet: "Self Fill",
      sourceRowNumber: rowNum++,
      boqNo: parentNo,
      parentBoqNo: null,
      depth: 0,
      isGroup: true,
      displayName: parent.displayName.trim() || `Group ${parentNo}`,
      description: parent.displayName.trim(),
      unit: null,
      tenderQty: null,
      rate: null,
      estimateAmt: null,
      importMode: "STRICT_TEMPLATE",
      warnings: [],
    });

    parent.children.forEach((child, cIdx) => {
      const childSeg = resolveSegment(child.boqNoOverride, cIdx + 1);
      const childNo = `${parentNo}.${childSeg}`;

      if (child.mode === "leaf") {
        const qty = numOrNull(child.tenderQty);
        const rate = numOrNull(child.rate);
        const amt = qty !== null && rate !== null ? qty * rate : null;
        rows.push({
          category,
          sourceSheet: "Self Fill",
          sourceRowNumber: rowNum++,
          boqNo: childNo,
          parentBoqNo: parentNo,
          depth: 1,
          isGroup: false,
          displayName: child.displayName.trim() || `Item ${childNo}`,
          description: child.displayName.trim(),
          unit: child.unit.trim() || null,
          tenderQty: qty,
          rate,
          estimateAmt: amt,
          importMode: "STRICT_TEMPLATE",
          warnings: [],
        });
        return;
      }

      // group mode: emit group row + its line items
      rows.push({
        category,
        sourceSheet: "Self Fill",
        sourceRowNumber: rowNum++,
        boqNo: childNo,
        parentBoqNo: parentNo,
        depth: 1,
        isGroup: true,
        displayName: child.displayName.trim() || `Sub-group ${childNo}`,
        description: child.displayName.trim(),
        unit: null,
        tenderQty: null,
        rate: null,
        estimateAmt: null,
        importMode: "STRICT_TEMPLATE",
        warnings: [],
      });

      child.lineItems.forEach((li, lIdx) => {
        const liSeg = resolveSegment(li.boqNoOverride, lIdx + 1);
        const liNo = `${childNo}.${liSeg}`;
        const qty = numOrNull(li.tenderQty);
        const rate = numOrNull(li.rate);
        const amt = qty !== null && rate !== null ? qty * rate : null;
        rows.push({
          category,
          sourceSheet: "Self Fill",
          sourceRowNumber: rowNum++,
          boqNo: liNo,
          parentBoqNo: childNo,
          depth: 2,
          isGroup: false,
          displayName: li.displayName.trim() || `Item ${liNo}`,
          description: li.displayName.trim(),
          unit: li.unit.trim() || null,
          tenderQty: qty,
          rate,
          estimateAmt: amt,
          importMode: "STRICT_TEMPLATE",
          warnings: [],
        });
      });
    });
  });

  return rows;
}

export function boqUploadError(
  res: Response,
  json: { error?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (res.status === 403) return NO_IMPORT_PERMISSION_MSG;
  return json?.error ?? json?.message ?? fallback;
}