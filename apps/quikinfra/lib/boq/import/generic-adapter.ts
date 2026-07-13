/**
 * Generic SOR BOQ Adapter (Aakar-reference, IMPROVED)
 *
 * Source format (9 columns, header row auto-detected anywhere in first 15 rows):
 *
 *   A: S.No.                  serial number — ignored for hierarchy
 *   B: SOR Item No            top-level ref ("4")
 *   C: SOR Sub Item No        sub-ref ("4.1.1.4") — preferred for hierarchy
 *   D: Item Name              short label
 *   E: Description of Item    long description
 *   F: Unit                   UOM
 *   G: Quantity               tender qty
 *   H: Rate                   unit rate
 *   I: Amount                 cross-check only — pipeline computes from qty*rate
 *
 * Improvements over the legacy Aakar parser:
 *
 * 1) Header auto-detect.  Many real-world SOR BOQs have a banner / project
 *    info block above the actual table. We scan the first 15 rows looking
 *    for one that contains "S.No." in column A (case- and dot-insensitive).
 *
 * 2) Improved leaf rule.  Old rule: `hasUnit && hasQty && qty != 0` →
 *    qty=0 was misclassified as a group, which broke real BOQs where a
 *    line is written but quantity TBD. New rule:
 *
 *       leaf  = hasUnit && hasRate
 *       group = !leaf
 *
 *    Negative quantities are LEGAL (deduct lines, common in road BOQs).
 *
 * 3) Parent resolution: prefix-first, stack-fallback.  See hierarchy.ts.
 *
 * 4) Amount column is a CROSS-CHECK only, never authoritative.
 */

import type {
  AdapterRunResult,
  AdapterSheetResult,
  NormalizedBoqRow,
  RawSheet,
  ImportIssue,
} from "./types";
import { resolveCategory, shouldIgnoreSheet } from "./category-map";
import {
  isCellEmpty,
  isHeaderLabel,
  normaliseDescription,
  normaliseUnit,
  parseNumeric,
  trimStr,
  truncateName,
} from "./cell-utils";

/**
 * Role-based header aliases. A role maps to the LOGICAL column (serial / sor
 * item / sub-item / item name / description / unit / qty / rate / amount).
 * Columns are located by matching each header cell against these aliases at
 * detection time, so the adapter handles both the classic 9-column Aakar
 * layout AND condensed sheets like `I/NO. · SOR Numbers · Description ·
 * Total Quantity · Unit` where positions and presence differ.
 */
const ROLE_ALIASES = {
  serial:      ["S.No.", "S No", "Sr No", "Serial No", "Sl No", "Sno", "I/NO", "I.NO", "INO", "Item No", "BOQ No"],
  sorItem:     ["SOR", "SOR Item No", "SOR Item", "SOR No", "SOR Numbers", "SOR Number", "SOR Code", "SOR Ref"],
  sorSub:      ["SOR Sub Item No", "Sub Item No", "Sub Item", "Sub No"],
  itemName:    ["Item Name", "Name"],
  description: ["Description of Item", "Description", "Item Description", "Discription", "Description for level use items"],
  unit:        ["Unit", "UOM", "Unit of Measure"],
  qty:         ["Quantity", "Qty", "Tender Qty", "Total Quantity", "Total Qty", "Tender Quantity"],
  rate:        ["Rate", "Unit Rate"],
  amount:      ["Amount", "Total Amount", "Total"],
} as const;

type ColRole = keyof typeof ROLE_ALIASES;
type ColMap = Partial<Record<ColRole, number>>;

/**
 * Scan the first 15 rows and build a role→column-index map. Each header
 * cell is classified individually, so column order doesn't matter. A row
 * qualifies as the header when it contains at least one reference column
 * (serial / sorItem / sorSub) AND a description-like column.
 */
function detectGenericHeader(sheet: RawSheet): { rowIndex: number; colMap: ColMap } | null {
  if (!sheet.rows || sheet.rows.length === 0) return null;
  const limit = Math.min(15, sheet.rows.length);

  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] ?? [];
    const colMap: ColMap = {};

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (isCellEmpty(cell)) continue;
      for (const role of Object.keys(ROLE_ALIASES) as ColRole[]) {
        if (colMap[role] !== undefined) continue; // role already filled
        if (isHeaderLabel(cell, ROLE_ALIASES[role] as unknown as string[])) {
          colMap[role] = c;
          break;
        }
      }
    }

    const hasRef =
      colMap.serial !== undefined ||
      colMap.sorItem !== undefined ||
      colMap.sorSub !== undefined;
    const hasDesc = colMap.description !== undefined || colMap.itemName !== undefined;

    if (hasRef && hasDesc) {
      return { rowIndex: r, colMap };
    }
  }
  return null;
}

/**
 * Quick check: does this sheet look like a generic SOR BOQ?
 * Used by the detector.
 */
export function looksLikeGenericSor(sheet: RawSheet): {
  ok: boolean;
  headerRowIndex: number;
  reason: string;
} {
  const hit = detectGenericHeader(sheet);
  if (!hit) {
    return {
      ok: false,
      headerRowIndex: -1,
      reason: "no recognisable header (need a reference column + description in the first 15 rows)",
    };
  }
  const parts: string[] = [];
  if (hit.colMap.serial !== undefined) parts.push(`serial@${hit.colMap.serial}`);
  if (hit.colMap.sorItem !== undefined) parts.push(`sor@${hit.colMap.sorItem}`);
  if (hit.colMap.sorSub !== undefined) parts.push(`sub@${hit.colMap.sorSub}`);
  if (hit.colMap.description !== undefined) parts.push(`desc@${hit.colMap.description}`);
  return {
    ok: true,
    headerRowIndex: hit.rowIndex,
    reason: `header at row ${hit.rowIndex + 1} (${parts.join(", ")})`,
  };
}

/** Legacy export — kept for any outside caller that still imports it. */
export function findGenericHeaderRow(sheet: RawSheet): number {
  return detectGenericHeader(sheet)?.rowIndex ?? -1;
}

function parseGenericSheet(sheet: RawSheet): AdapterSheetResult {
  const issues: ImportIssue[] = [];
  const rows: NormalizedBoqRow[] = [];

  if (shouldIgnoreSheet(sheet.sheetName)) {
    return {
      sheetName: sheet.sheetName,
      category: "",
      rows: [],
      issues: [
        {
          code: "SHEET_SKIPPED",
          severity: "info",
          sheet: sheet.sheetName,
          message: `Sheet '${sheet.sheetName}' looks like an instructions/cover tab — skipped.`,
        },
      ],
    };
  }

  // Category is optional — sheet name is used as-is if it doesn't match
  // one of the canonical labels. No warning either way.
  const cat = resolveCategory(sheet.sheetName);

  const header = detectGenericHeader(sheet);
  if (!header) {
    return {
      sheetName: sheet.sheetName,
      category: cat.canonical,
      rows: [],
      issues: [
        ...issues,
        {
          code: "HEADER_NOT_FOUND",
          severity: "error",
          sheet: sheet.sheetName,
          message:
            `Could not find a recognisable BOQ header in the first 15 rows of ` +
            `sheet '${sheet.sheetName}'. Need at least one reference column ` +
            `(S.No / I/NO / SOR Item / SOR Numbers / BOQ No) and a description column.`,
        },
      ],
    };
  }
  const { rowIndex: headerRowIndex, colMap } = header;

  // Role-based cell accessors. When a role isn't mapped for this sheet,
  // return "" / NaN so the isLeaf / hasRate checks react correctly.
  const strAt = (row: unknown[], role: ColRole): string =>
    colMap[role] !== undefined ? trimStr(row[colMap[role]!]) : "";
  const unitAt = (row: unknown[]): string =>
    colMap.unit !== undefined ? normaliseUnit(row[colMap.unit!]) : "";
  const numAt = (row: unknown[], role: ColRole): number =>
    colMap[role] !== undefined ? parseNumeric(row[colMap[role]!]) : NaN;
  const cellEmptyAt = (row: unknown[], role: ColRole): boolean =>
    colMap[role] === undefined || isCellEmpty(row[colMap[role]!]);

  const rateColPresent = colMap.rate !== undefined;
  const qtyColPresent = colMap.qty !== undefined;

  // Carry-forward state for continuation rows (description-only rows
  // that should append to the previous billable item).
  let lastRowIdx = -1;

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? [];
    const sourceRowNumber = i + 1;

    const colA = strAt(row, "serial");       // S.No / I/NO / BOQ No
    const colB = strAt(row, "sorItem");      // SOR Item / SOR Numbers
    const colC = strAt(row, "sorSub");       // SOR Sub Item No (optional)
    const colD = strAt(row, "itemName");     // Item Name (optional)
    const colE = strAt(row, "description");  // Description
    const colF = unitAt(row);                // Unit
    const colG = numAt(row, "qty");          // Qty
    const colH = numAt(row, "rate");         // Rate (may be absent)
    const colI = numAt(row, "amount");       // Amount (may be absent)

    // True blank → skip.
    const allEmpty =
      cellEmptyAt(row, "serial") &&
      cellEmptyAt(row, "sorItem") &&
      cellEmptyAt(row, "sorSub") &&
      cellEmptyAt(row, "itemName") &&
      cellEmptyAt(row, "description") &&
      cellEmptyAt(row, "unit") &&
      cellEmptyAt(row, "qty");
    if (allEmpty) continue;

    // Continuation row: ref/unit/qty/rate blank but some text present → append to previous
    if (
      !colA && !colB && !colC && !colF &&
      isNaN(colG) && isNaN(colH) &&
      (colD || colE)
    ) {
      if (lastRowIdx >= 0) {
        const prev = rows[lastRowIdx];
        const extra = [colD, colE].filter(Boolean).join(" ");
        prev.description = normaliseDescription(prev.description + " " + extra);
      }
      continue;
    }

    // Reference resolution: pick the MOST SPECIFIC ref (most dots wins).
    // Classic layout: col C (Sub-Item No) is usually the deepest path.
    // Alphabetic layout: col B (SOR Numbers, e.g. "A.2.2.1") has the full path
    // while col A holds just "a." — dot count correctly prefers col B.
    const candidates = [colC, colB, colA].filter(Boolean);
    const pickedRaw = candidates.length
      ? candidates.reduce((best, cur) =>
          (cur.match(/\./g)?.length ?? 0) > (best.match(/\./g)?.length ?? 0) ? cur : best,
        )
      : "";
    // Normalise away trailing separators (`A.3.` → `A.3`, `A.2/` → `A.2`).
    // Without this, a section-header row with a dangling dot registers at
    // one depth deeper than its own children, and `prefixParent("A.3.1")`
    // → `A.3` would miss a stored `A.3.` in the refIndex. The fix makes
    // section headers and their children line up on the hierarchy.
    const ref = pickedRaw.replace(/[.\-/]+$/, "").trim();
    // No BOQ reference anywhere → likely a stray note / merged-cell artefact.
    // Skip silently instead of failing the whole upload.
    if (!ref) continue;

    const hasUnit = colF.length > 0;
    const hasRate = !isNaN(colH);
    const hasQty = !isNaN(colG);

    // LEAF RULE
    //   - Rate column present: leaf = unit + rate (qty may be 0/negative).
    //   - Rate column absent (e.g. alphabetic SOR sheets with no Rate): leaf
    //     = unit present. Rate/amount land as null so the user can fill them
    //     on the BOQ grid.
    const isLeaf = rateColPresent ? hasUnit && hasRate : hasUnit;
    const isGroup = !isLeaf;

    const warnings: ImportIssue[] = [];

    if (isLeaf && !hasQty && qtyColPresent) {
      warnings.push({
        code: "QTY_MISSING",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: ref,
        message: `Quantity missing for '${ref}'. Imported as 0.`,
      });
    }
    if (isLeaf && hasQty && colG < 0) {
      warnings.push({
        code: "NEGATIVE_QTY",
        severity: "info",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: ref,
        message: `Negative qty (${colG}) — treated as deduct item.`,
      });
    }
    if (isLeaf && !isNaN(colI) && hasQty && hasRate && colG !== 0 && colH !== 0) {
      const calculated = colG * colH;
      if (calculated !== 0) {
        const variance = Math.abs(calculated - colI) / Math.abs(calculated);
        if (variance > 0.01) {
          warnings.push({
            code: "AMOUNT_MISMATCH",
            severity: "warning",
            sheet: sheet.sheetName,
            rowNumber: sourceRowNumber,
            boqNo: ref,
            field: "Amount",
            message:
              `Amount column (${colI.toFixed(2)}) differs from Qty × Rate ` +
              `(${calculated.toFixed(2)}) by more than 1%. ERP will use Qty × Rate.`,
          });
        }
      }
    }
    if (!colD && !colE) {
      warnings.push({
        code: "DESCRIPTION_MISSING",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: ref,
        message: `No item name or description — using BOQ No as display name.`,
      });
    }

    // Depth from dot + dash count, capped at 3 (AAKAR spec §6.3).
    const rawDepth = (ref.match(/[.\-]/g) || []).length;
    const depth = Math.min(rawDepth, 3);
    if (rawDepth > 3) {
      warnings.push({
        code: "DEPTH_CAPPED",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: ref,
        message: `Depth ${rawDepth} exceeds max 3 — clamped to 3.`,
      });
    }

    rows.push({
      projectId: "",
      orgId: "",
      importMode: "GENERIC_SOR",
      importBatchId: null,
      category: cat.canonical,
      sourceSheet: sheet.sheetName,
      sourceRowNumber,

      rawSerialNo: colA || null,
      rawSorNo: colB || null,
      rawSubNo: colC || null,
      rawBoqNo: ref,

      boqNo: ref,
      parentBoqNo: null,
      depth,
      sortOrder: 0,

      isGroup,

      displayName: truncateName(colD || colE || ref),
      itemName: colD,
      description: normaliseDescription(colE || colD),

      unit: isLeaf ? colF : null,
      // When the source sheet has no qty/rate column, store null (blank)
      // rather than a fake 0. If the column exists but the cell is empty we
      // fall back to 0 so downstream math still works.
      tenderQty: isLeaf
        ? (hasQty ? colG : (qtyColPresent ? 0 : null))
        : null,
      rate: isLeaf
        ? (hasRate ? colH : (rateColPresent ? 0 : null))
        : null,
      estimateAmt: isLeaf && hasQty && hasRate ? colG * colH : null,
      excelAmount: !isNaN(colI) ? colI : null,

      scopeQty: 0,
      subDoneQty: 0,
      selfDoneQty: 0,
      billedQty: 0,

      warnings,
    });
    lastRowIdx = rows.length - 1;
  }

  return {
    sheetName: sheet.sheetName,
    category: cat.canonical,
    rows,
    issues,
    detectedColumns: Object.fromEntries(
      Object.entries(colMap).filter(([, v]) => v !== undefined) as [string, number][],
    ),
  };
}

export function runGenericAdapter(sheets: RawSheet[]): AdapterRunResult {
  const sheetResults: AdapterSheetResult[] = [];

  for (const s of sheets) {
    const result = parseGenericSheet(s);
    sheetResults.push(result);
  }

  return {
    mode: "GENERIC_SOR",
    sheets: sheetResults,
    issues: [],
  };
}
