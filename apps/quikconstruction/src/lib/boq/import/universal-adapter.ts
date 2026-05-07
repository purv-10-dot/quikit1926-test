/**
 * Universal BOQ Import Adapter — spec-driven, manual-mapping variant.
 *
 * Implements stages S1–S3 and S5–S6 from AAKAR ERP BOQ Universal Import
 * Engine Spec v1.0. The S4 stage (AI column mapping) is replaced with a
 * user-supplied `UniversalColMap` — the drawer shows a mapping screen where
 * the user picks which column goes to which standard field; we just apply it.
 *
 * Pipeline for one sheet:
 *   1. Keyword-score header row detection (spec §2.1): scan first 30 rows,
 *      count matches against CANDIDATE_KEYWORDS, pick row with highest score
 *      (threshold 0.3, ≥3 non-empty cells).
 *   2. Extract raw column names (blank → Col_<i>) + 5 sample values each.
 *   3. Apply the user-supplied column map to each data row.
 *   4. Classify each row (SECTION_HEADER / LINE_ITEM / SUBTOTAL / SKIP) via
 *      the decision tree in §3.1: numeric qty or known UOM → LINE_ITEM;
 *      description matching "sub total / grand total" → SUBTOTAL (skipped);
 *      description-only → SECTION_HEADER.
 *   5. Depth inferred from BOQ No separators (spec §3.2 Signal 1).
 *   6. Normalise unit via uom-map; numbers via parseIndianNumber.
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
  normaliseDescription,
  trimStr,
  truncateName,
} from "./cell-utils";
import { isKnownUom, normalizeUom } from "./uom-map";
import { parseIndianNumber } from "./number-parser";

// ──────────────────────────────────────────────────────────────────────
// Public API — the shape the drawer submits
// ──────────────────────────────────────────────────────────────────────

/** The standard BOQ fields a column can be mapped to. `IGNORE` = skip. */
export type UniversalField =
  | "boq_number"
  | "description"
  | "unit"
  | "rate"
  | "qty_tender"
  | "qty_scope"
  | "qty_subco"
  | "qty_self"
  | "amt_estimated"
  | "amt_billed"
  | "IGNORE";

/** Per-sheet column mapping: column index → standard field. */
export interface UniversalColMap {
  [columnIndex: number]: UniversalField;
}

/** User's choices for how to parse a workbook. Keyed by sheetName. */
export interface UniversalMapping {
  bySheet: Record<string, {
    headerRowIndex: number;
    colMap: UniversalColMap;
  }>;
}

/** Read-only detection of a sheet's headers — returned by /detect-columns. */
export interface DetectedSheetColumns {
  sheetName: string;
  headerRowIndex: number;     // -1 = no confident header
  headerScore: number;        // 0..1 — keyword-match score
  columns: Array<{
    index: number;
    name: string;             // raw header text; "Col_<i>" if blank
    samples: string[];        // first up to 5 non-empty sample values
    suggested: UniversalField; // heuristic suggestion; user can override
    confidence: number;       // 0..1 for the suggestion
  }>;
}

// ──────────────────────────────────────────────────────────────────────
// Header detection — spec §2.1
// ──────────────────────────────────────────────────────────────────────

const CANDIDATE_KEYWORDS = [
  "description", "item", "work", "particulars", "activity", "name",
  "unit", "uom",
  "qty", "quantity", "quantit",
  "rate", "amount", "total",
  "sno", "sr", "no", "sl", "boq", "sor", "ino", "itemno",
  "nos", "cum", "rmt",
];

function normaliseCellForMatch(v: unknown): string {
  return trimStr(v)
    .toLowerCase()
    .replace(/[\s.\-_/()\[\]]+/g, "");
}

/** Count how many cells in `row` match any keyword; return [matches, nonEmpty]. */
function scoreRowAsHeader(row: unknown[]): { matches: number; nonEmpty: number } {
  let matches = 0;
  let nonEmpty = 0;
  for (const cell of row) {
    if (isCellEmpty(cell)) continue;
    nonEmpty++;
    const norm = normaliseCellForMatch(cell);
    if (!norm) continue;
    for (const k of CANDIDATE_KEYWORDS) {
      if (norm === k || norm.includes(k)) {
        matches++;
        break;
      }
    }
  }
  return { matches, nonEmpty };
}

/** Find the best header-row candidate. Returns null if no row scores ≥0.3. */
export function detectUniversalHeader(sheet: RawSheet): {
  rowIndex: number;
  score: number;
} | null {
  if (!sheet.rows?.length) return null;
  const limit = Math.min(30, sheet.rows.length);

  let best: { rowIndex: number; score: number } | null = null;
  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] ?? [];
    const { matches, nonEmpty } = scoreRowAsHeader(row);
    if (nonEmpty < 3) continue;
    const score = matches / nonEmpty;
    if (score < 0.3) continue;
    if (!best || score > best.score) best = { rowIndex: r, score };
  }
  return best;
}

// ──────────────────────────────────────────────────────────────────────
// Column-name → suggested standard-field heuristics
// ──────────────────────────────────────────────────────────────────────

// Keyword hints for the auto-suggest. User can override any of these in the
// mapping screen, so the heuristic is deliberately simple and generous.
const FIELD_HINTS: Array<{ field: UniversalField; patterns: RegExp[] }> = [
  { field: "boq_number",    patterns: [/^(s|sl|sr)\.?no/i, /^i\.?no/i, /itemno/i, /boqno/i, /^sor$/i, /sorno/i, /sornumber/i, /sornumbers/i, /sorcode/i, /sorref/i, /^no\.?$/i] },
  { field: "description",   patterns: [/descr/i, /particular/i, /itemname/i, /workdescription/i, /^name$/i, /^work$/i, /^activity$/i, /^item$/i] },
  { field: "unit",          patterns: [/^unit$/i, /^uom$/i, /unitofmeasure/i] },
  { field: "rate",          patterns: [/^rate$/i, /unitrate/i, /priceperunit/i] },
  { field: "qty_tender",    patterns: [/tenderqty/i, /tenderquantity/i, /contractqty/i, /boqqty/i, /totalquantit/i, /totalqty/i, /^qty$/i, /^quantit/i] },
  { field: "qty_scope",     patterns: [/scopeqty/i, /revisedqty/i, /scopequantity/i] },
  { field: "qty_subco",     patterns: [/sub.?coqty/i, /subcontractor/i, /subcoqty/i] },
  { field: "qty_self",      patterns: [/selfqty/i, /ownwork/i, /selfdonequantity/i] },
  { field: "amt_estimated", patterns: [/estimatedamount/i, /totalamount/i, /^amount$/i, /estimateamt/i] },
  { field: "amt_billed",    patterns: [/billedamount/i, /executedamount/i, /rabamount/i] },
];

function suggestField(columnName: string, samples: string[]): {
  field: UniversalField;
  confidence: number;
} {
  const norm = (columnName || "").toLowerCase().replace(/[\s.\-_]+/g, "");
  if (!norm) return { field: "IGNORE", confidence: 0 };

  // Header-name matching — first matching pattern wins.
  for (const { field, patterns } of FIELD_HINTS) {
    for (const p of patterns) {
      if (p.test(norm)) {
        // Confidence bump if a sample also "looks right" for the field.
        const looksRight = samplesLookRight(field, samples);
        return { field, confidence: looksRight ? 0.95 : 0.8 };
      }
    }
  }

  // Fallback: sample-shape heuristic (pure numeric → qty_tender; looks like a
  // UOM → unit; dotted-string → boq_number; long text → description).
  const nonEmpty = samples.filter(Boolean);
  if (nonEmpty.length === 0) return { field: "IGNORE", confidence: 0.3 };

  const allNumeric = nonEmpty.every((s) => Number.isFinite(parseIndianNumber(s)));
  const mostlyShort = nonEmpty.every((s) => s.length <= 8);
  const mostlyLong = nonEmpty.some((s) => s.length > 20);
  const mostlyUom = nonEmpty.filter((s) => isKnownUom(s)).length >= Math.ceil(nonEmpty.length / 2);
  const mostlyDotted = nonEmpty.filter((s) => /[.\-]/.test(s) && s.length <= 20).length >= Math.ceil(nonEmpty.length / 2);

  if (mostlyUom) return { field: "unit", confidence: 0.75 };
  if (allNumeric && mostlyShort) return { field: "qty_tender", confidence: 0.55 };
  if (mostlyDotted) return { field: "boq_number", confidence: 0.6 };
  if (mostlyLong) return { field: "description", confidence: 0.55 };
  return { field: "IGNORE", confidence: 0.2 };
}

function samplesLookRight(field: UniversalField, samples: string[]): boolean {
  const nonEmpty = samples.filter(Boolean);
  if (nonEmpty.length === 0) return false;
  switch (field) {
    case "unit":
      return nonEmpty.filter((s) => isKnownUom(s)).length >= 1;
    case "rate":
    case "qty_tender":
    case "qty_scope":
    case "qty_subco":
    case "qty_self":
    case "amt_estimated":
    case "amt_billed":
      return nonEmpty.filter((s) => Number.isFinite(parseIndianNumber(s))).length >= Math.ceil(nonEmpty.length / 2);
    case "boq_number":
      return nonEmpty.filter((s) => /\d/.test(s) && s.length <= 20).length >= 1;
    case "description":
      return nonEmpty.some((s) => s.length > 10);
    default:
      return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public: detect columns for the mapping UI
// ──────────────────────────────────────────────────────────────────────

export function detectColumnsForSheet(sheet: RawSheet): DetectedSheetColumns {
  const header = detectUniversalHeader(sheet);

  if (!header) {
    // No confident header — return empty column list; the UI can fall back
    // to asking the user to pick a header row manually (out of scope here).
    return {
      sheetName: sheet.sheetName,
      headerRowIndex: -1,
      headerScore: 0,
      columns: [],
    };
  }

  const headerRow = sheet.rows[header.rowIndex] ?? [];
  const dataRows = sheet.rows.slice(header.rowIndex + 1, header.rowIndex + 6);

  const columns = headerRow.map((cell, index) => {
    const raw = trimStr(cell);
    const name = raw || `Col_${index}`;
    const samples: string[] = [];
    for (const dr of dataRows) {
      const v = dr?.[index];
      if (!isCellEmpty(v) && samples.length < 5) samples.push(trimStr(v));
    }
    const suggestion = suggestField(raw, samples);
    return {
      index,
      name,
      samples: samples.slice(0, 3),
      suggested: suggestion.field,
      confidence: suggestion.confidence,
    };
  });

  return {
    sheetName: sheet.sheetName,
    headerRowIndex: header.rowIndex,
    headerScore: header.score,
    columns,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Row classification — spec §3.1
// ──────────────────────────────────────────────────────────────────────

const SUBTOTAL_RE = /(sub.?total|grand.?total|total.*chapter|total.*section)/i;

type RowType = "SECTION_HEADER" | "LINE_ITEM" | "SUBTOTAL" | "SKIP";

function classifyRow(parsed: {
  description: string;
  unit: string;
  rate: number;
  qty: number;
  hasAnyMappedValue: boolean;
}): RowType {
  const { description, unit, rate, qty, hasAnyMappedValue } = parsed;
  if (!hasAnyMappedValue) return "SKIP";

  if (description && SUBTOTAL_RE.test(description)) return "SUBTOTAL";

  const hasUnit = unit.length > 0;
  const hasQty = Number.isFinite(qty);
  const hasRate = Number.isFinite(rate);
  if (isKnownUom(unit) || (hasQty && qty > 0) || (hasUnit && hasRate)) {
    return "LINE_ITEM";
  }

  if (description && description.trim().length > 0) return "SECTION_HEADER";
  return "SKIP";
}

// ──────────────────────────────────────────────────────────────────────
// Main run — applies the user-supplied mapping
// ──────────────────────────────────────────────────────────────────────

/** Read a cell for a given field via the user's column map. */
function firstMapped(colMap: UniversalColMap, field: UniversalField, row: unknown[]): unknown {
  for (const [idxStr, mappedField] of Object.entries(colMap)) {
    if (mappedField !== field) continue;
    return row[Number(idxStr)];
  }
  return undefined;
}

function parseSheet(
  sheet: RawSheet,
  sheetMapping: { headerRowIndex: number; colMap: UniversalColMap },
): AdapterSheetResult {
  const issues: ImportIssue[] = [];
  const rows: NormalizedBoqRow[] = [];

  if (shouldIgnoreSheet(sheet.sheetName)) {
    return {
      sheetName: sheet.sheetName,
      category: "",
      rows: [],
      issues: [{
        code: "SHEET_SKIPPED",
        severity: "info",
        sheet: sheet.sheetName,
        message: `Sheet '${sheet.sheetName}' looks like an instructions/cover tab — skipped.`,
      }],
    };
  }

  // Category is optional — the sheet name is used as-is when it doesn't
  // match Civil / Electrical / Road. No warning either way.
  const cat = resolveCategory(sheet.sheetName);

  // Track auto-generated BOQ numbers for when the user did not map a boq_number column.
  const hasBoqNumberCol = Object.values(sheetMapping.colMap).includes("boq_number");
  let autoHeaderSeq = 0;        // "1", "2", "3" for headers when BOQ No is unmapped
  let autoItemSeq = 0;          // item counter under current header
  let currentAutoHeader: string | null = null;

  for (let i = sheetMapping.headerRowIndex + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? [];
    const sourceRowNumber = i + 1;

    // Extract every mapped field using the user's colMap.
    const rawBoqNo = trimStr(firstMapped(sheetMapping.colMap, "boq_number", row));
    const description = normaliseDescription(
      firstMapped(sheetMapping.colMap, "description", row),
    );
    const unitRaw = trimStr(firstMapped(sheetMapping.colMap, "unit", row));
    const unit = unitRaw ? normalizeUom(unitRaw) : "";
    const rate = parseIndianNumber(firstMapped(sheetMapping.colMap, "rate", row));
    const qty = parseIndianNumber(firstMapped(sheetMapping.colMap, "qty_tender", row));

    const hasAnyMappedValue =
      !!rawBoqNo || !!description || !!unit ||
      Number.isFinite(rate) || Number.isFinite(qty);

    const type = classifyRow({
      description,
      unit,
      rate,
      qty,
      hasAnyMappedValue,
    });

    if (type === "SKIP" || type === "SUBTOTAL") continue;

    // Resolve boqNo — either from the mapped column or auto-generated.
    let boqNo = rawBoqNo;
    if (!boqNo) {
      if (!hasBoqNumberCol) {
        if (type === "SECTION_HEADER") {
          autoHeaderSeq++;
          autoItemSeq = 0;
          currentAutoHeader = String(autoHeaderSeq);
          boqNo = currentAutoHeader;
        } else {
          if (currentAutoHeader === null) {
            autoHeaderSeq++;
            currentAutoHeader = String(autoHeaderSeq);
          }
          autoItemSeq++;
          boqNo = `${currentAutoHeader}.${autoItemSeq}`;
        }
      } else {
        // Column was mapped but this cell was empty — skip (stray note).
        continue;
      }
    }

    // Depth from BOQ No separators — AAKAR Column Mapper Spec v1.0 §6.3:
    // count dots + dashes (not slashes), cap at 3 so the tree stays within
    // the chapter / section / item hierarchy the BOQ grid expects.
    const sepCount = (boqNo.match(/[.\-]/g) || []).length;
    const depth = Math.min(sepCount, 3);

    const isGroup = type === "SECTION_HEADER";

    const warnings: ImportIssue[] = [];
    if (!description) {
      warnings.push({
        code: "DESCRIPTION_MISSING",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo,
        message: `No description on row ${sourceRowNumber} — using BOQ No as display name.`,
      });
    }
    if (!isGroup && unit && !isKnownUom(unit)) {
      warnings.push({
        code: "UNKNOWN_UOM",
        severity: "warning",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo,
        message: `Unit '${unitRaw}' is not in the standard UOM list — imported as '${unit}'. Verify before lock.`,
      });
    }
    if (!isGroup && Number.isFinite(qty) && qty < 0) {
      warnings.push({
        code: "NEGATIVE_QTY",
        severity: "info",
        sheet: sheet.sheetName,
        rowNumber: sourceRowNumber,
        boqNo,
        message: `Negative qty (${qty}) — treated as deduct / amendment item.`,
      });
    }

    rows.push({
      projectId: "",
      tenantId: "",
      importMode: "GENERIC_SOR", // stored as GENERIC_SOR for DB compatibility
      importBatchId: null,
      category: cat.canonical,
      sourceSheet: sheet.sheetName,
      sourceRowNumber,

      rawSerialNo: null,
      rawSorNo: null,
      rawSubNo: null,
      rawBoqNo: rawBoqNo || boqNo,

      boqNo,
      parentBoqNo: null,
      depth,
      sortOrder: 0,

      isGroup,

      displayName: truncateName(description || boqNo),
      itemName: description,
      description,

      unit: isGroup ? null : (unit || null),
      tenderQty: isGroup ? null : (Number.isFinite(qty) ? qty : null),
      rate: isGroup ? null : (Number.isFinite(rate) ? rate : null),
      estimateAmt:
        isGroup || !Number.isFinite(qty) || !Number.isFinite(rate) ? null : qty * rate,
      excelAmount: null,

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
  };
}

export function runUniversalAdapter(
  sheets: RawSheet[],
  mapping: UniversalMapping,
): AdapterRunResult {
  const sheetResults: AdapterSheetResult[] = [];
  const workbookIssues: ImportIssue[] = [];

  for (const s of sheets) {
    const sm = mapping.bySheet[s.sheetName];
    if (!sm) {
      workbookIssues.push({
        code: "NO_MAPPING_FOR_SHEET",
        severity: "info",
        sheet: s.sheetName,
        message: `Sheet '${s.sheetName}' has no column mapping — skipped.`,
      });
      continue;
    }
    sheetResults.push(parseSheet(s, sm));
  }

  return {
    mode: "GENERIC_SOR",
    sheets: sheetResults,
    issues: workbookIssues,
  };
}
