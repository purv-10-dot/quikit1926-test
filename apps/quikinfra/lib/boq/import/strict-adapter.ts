/**
 * Strict QuikInfra Template Adapter
 *
 * Source format (6 fixed columns, header always at row 1):
 *
 *   A: BOQ No                e.g. "1", "1.1", "1.1.2", "4.1.1.4a"
 *   B: SOR No                free-form ref (kept as raw audit, optional)
 *   C: Description           required for both groups and items
 *   D: Unit                  required for billable items, blank for groups
 *   E: Rate                  required for billable items, blank for groups
 *   F: Op. Undone Qty        opening undone quantity (= tender qty for fresh imports)
 *
 * Sheets are typed by name (Civil / Ele / Road / etc.) and mapped via
 * `resolveCategory`. Header row is *always* row 1 in the strict template,
 * but we still tolerate a missing header by sniffing column A for "BOQ No".
 *
 * Leaf vs Group rule (strict):
 *   - has unit AND has rate → leaf (qty may be 0/negative — both legal)
 *   - else → group
 *
 * This is intentionally MORE permissive than the legacy Aakar parser:
 * a row with qty=0 is still a valid leaf (it's a quantity yet to be
 * issued), and negative qty is a deduct line, not an error.
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
  dotDepth,
} from "./cell-utils";

const STRICT_HEADER_LABELS = {
  A: ["BOQ No", "BOQ Number", "BOQ#", "BoqNo"],
  B: ["SOR No", "SOR Number", "SOR Ref", "Sor No"],
  C: ["Description", "Description of Item", "Item Description"],
  D: ["Unit", "UOM", "Unit of Measure"],
  E: ["Rate", "Unit Rate"],
  F: ["Op. Undone Qty", "Opening Undone Qty", "Op Undone Qty", "Tender Qty", "Quantity"],
};

const STRICT_REQUIRED_HEADERS = ["BOQ No"]; // Bare minimum to prove this is the strict format.

/**
 * Quick check: does this sheet look like the strict template?
 * Used by the detector to decide which adapter to dispatch.
 */
export function looksLikeStrictTemplate(sheet: RawSheet): {
  ok: boolean;
  headerRowIndex: number;
  reason: string;
} {
  if (!sheet.rows || sheet.rows.length === 0) {
    return { ok: false, headerRowIndex: -1, reason: "empty sheet" };
  }
  // Strict template puts header in row 1 (index 0). Allow up to row 5
  // for templates that include a project-info banner.
  for (let r = 0; r < Math.min(5, sheet.rows.length); r++) {
    const row = sheet.rows[r] ?? [];
    if (isHeaderLabel(row[0], STRICT_HEADER_LABELS.A)) {
      // Confidence boost if column F also matches
      const fOk = isHeaderLabel(row[5], STRICT_HEADER_LABELS.F);
      const dOk = isHeaderLabel(row[3], STRICT_HEADER_LABELS.D);
      if (fOk && dOk) {
        return { ok: true, headerRowIndex: r, reason: "BOQ No + Unit + Op. Undone Qty headers found" };
      }
      return { ok: true, headerRowIndex: r, reason: "BOQ No header found in column A" };
    }
  }
  return { ok: false, headerRowIndex: -1, reason: "no 'BOQ No' header in column A" };
}

/**
 * Parse one sheet under the strict-template contract.
 */
function parseStrictSheet(sheet: RawSheet): AdapterSheetResult {
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

  // Category is now optional — we just use whatever the sheet name resolves
  // to (matched or passthrough). No warning either way; the user does not
  // need to align sheet names with Civil / Electrical / Road to import.
  const cat = resolveCategory(sheet.sheetName);

  const sniff = looksLikeStrictTemplate(sheet);
  if (!sniff.ok) {
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
            `Could not find 'BOQ No' header in sheet '${sheet.sheetName}'. ` +
            `Expected the strict QuikInfra template (BOQ No / SOR No / ` +
            `Description / Unit / Rate / Op. Undone Qty).`,
        },
      ],
    };
  }

  // Every row after header is a candidate. Header row 1-based = sniff.headerRowIndex + 1.
  for (let i = sniff.headerRowIndex + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? [];
    const sourceRowNumber = i + 1; // 1-based for user-facing errors

    const colA = trimStr(row[0]);  // BOQ No
    const colB = trimStr(row[1]);  // SOR No
    const colC = trimStr(row[2]);  // Description
    const colD = normaliseUnit(row[3]); // Unit
    const colE = parseNumeric(row[4]);  // Rate
    const colF = parseNumeric(row[5]);  // Op. Undone Qty

    // Skip true blank rows
    if (
      isCellEmpty(row[0]) &&
      isCellEmpty(row[1]) &&
      isCellEmpty(row[2]) &&
      isCellEmpty(row[3]) &&
      isCellEmpty(row[4]) &&
      isCellEmpty(row[5])
    ) {
      continue;
    }

    // No BOQ No → typically a stray note, a merged-cell artefact, or a
    // sub-heading row (qty/rate filled but no ID). Skip silently — failing
    // the whole upload on these is worse than just dropping the row.
    if (!colA) continue;

    const hasUnit = colD.length > 0;
    const hasRate = !isNaN(colE);
    const hasQty = !isNaN(colF);
    const isLeaf = hasUnit && hasRate;
    const isGroup = !isLeaf;

    const warnings: ImportIssue[] = [];

    // Leaf rule violations downgraded to per-row warnings, not pipeline errors.
    if (isLeaf && !hasQty) {
      warnings.push({
        code: "QTY_MISSING",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: colA,
        field: "Op. Undone Qty",
        message: `Op. Undone Qty missing for '${colA}'. Imported as 0.`,
      });
    }
    if (isLeaf && hasQty && colF < 0) {
      warnings.push({
        code: "NEGATIVE_QTY",
        severity: "info",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: colA,
        message: `Negative qty (${colF}) — treated as deduct item.`,
      });
    }
    if (isLeaf && hasRate && colE < 0) {
      warnings.push({
        code: "NEGATIVE_RATE",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: colA,
        message: `Negative rate (${colE}) — unusual, please verify.`,
      });
    }
    if (!colC) {
      warnings.push({
        code: "DESCRIPTION_MISSING",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: colA,
        message: `Description blank — using BOQ No as display name.`,
      });
    }

    const depth = Math.min(dotDepth(colA), 5);
    if (dotDepth(colA) > 5) {
      warnings.push({
        code: "DEPTH_CAPPED",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo: colA,
        message: `Depth ${dotDepth(colA)} exceeds max 5 — clamped to 5.`,
      });
    }

    rows.push({
      // Tenant/project filled by pipeline
      projectId: "",
      orgId: "",
      importMode: "STRICT_TEMPLATE",
      importBatchId: null,
      category: cat.canonical,
      sourceSheet: sheet.sheetName,
      sourceRowNumber,

      rawSerialNo: null,
      rawSorNo: colB || null,
      rawSubNo: null,
      rawBoqNo: colA,

      boqNo: colA,
      parentBoqNo: null,         // resolved by pipeline.hierarchy
      depth,
      sortOrder: 0,              // assigned by pipeline

      isGroup,

      displayName: truncateName(colC || colA),
      itemName: colC,
      description: normaliseDescription(colC),

      unit: isLeaf ? colD : null,
      tenderQty: isLeaf ? (hasQty ? colF : 0) : null,
      rate: isLeaf ? (hasRate ? colE : 0) : null,
      estimateAmt: isLeaf
        ? (hasQty ? colF : 0) * (hasRate ? colE : 0)
        : null,
      excelAmount: null,         // strict template has no Amount column

      scopeQty: 0,
      subDoneQty: 0,
      selfDoneQty: 0,
      billedQty: 0,

      warnings,
    });
  }

  return {
    sheetName: sheet.sheetName,
    category: cat.canonical,
    rows,
    issues,
    detectedColumns: {
      A: 0, // BOQ No
      B: 1, // SOR No
      C: 2, // Description
      D: 3, // Unit
      E: 4, // Rate
      F: 5, // Op. Undone Qty
    },
  };
}

/**
 * Run the strict adapter across a workbook of raw sheets.
 */
export function runStrictAdapter(sheets: RawSheet[]): AdapterRunResult {
  const sheetResults: AdapterSheetResult[] = [];
  const issues: ImportIssue[] = [];

  for (const s of sheets) {
    const result = parseStrictSheet(s);
    sheetResults.push(result);
  }

  return {
    mode: "STRICT_TEMPLATE",
    sheets: sheetResults,
    issues,
  };
}
