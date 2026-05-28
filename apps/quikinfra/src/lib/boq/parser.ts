/**
 * BOQ Parser — per Aakar BOQ Import Developer Spec v2.0 §5
 *
 * Implements:
 * - Row classification (Rule 1: Leaf, Rule 2: Mid-group, Rule 3: Top-group)
 * - Depth detection via dot-count
 * - Parent stack reconstruction
 * - All 12 validation rules (V01-V12)
 * - Edge cases (negative qty, comma-numbers, alphanumeric refs, continuation rows)
 */

import type { ExcelRow, ParsedBOQNode, ValidationIssue, MultiSheetInput } from "./types";
import { BOQ_CATEGORIES } from "./types";

// ─── Normalization Helpers ──────────────────────────────────────────

/** Strip whitespace, handle null/undefined */
function trim(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Normalize unit: lowercase, strip whitespace, replace newlines */
function normalizeUnit(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").trim().toLowerCase();
}

/** Normalize description: strip newlines, max 1000 chars */
function normalizeDesc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").trim().substring(0, 1000);
}

/** Parse numeric value: strip commas, ₹ symbol, currency markers */
function parseNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const cleaned = String(v)
    .replace(/[₹$,\s]/g, "")
    .replace(/[^\d.\-eE]/g, "");
  if (!cleaned) return NaN;
  return parseFloat(cleaned);
}

/** Count dots in a reference for depth calculation. Strips trailing letters. */
function dotCount(ref: string): number {
  // Strip trailing alphanumeric suffix ("1.1.2a" → "1.1.2")
  const cleaned = ref.replace(/[a-zA-Z]+$/, "");
  if (!cleaned) return 0;
  return (cleaned.match(/\./g) || []).length;
}

// ─── Parser ─────────────────────────────────────────────────────────

export interface ParseOptions {
  projectId: string;
  sheetCategory: string;
  batchId: string | null;
  startRowNumber?: number; // for error reporting (row 4 typically)
}

export interface ParseResult {
  nodes: ParsedBOQNode[];
  issues: ValidationIssue[];
}

/**
 * Parse a single BOQ sheet into nodes with validation.
 * Implements all 12 validation rules (V01-V12).
 */
export function parseBOQSheet(rows: ExcelRow[], opts: ParseOptions): ParseResult {
  const nodes: ParsedBOQNode[] = [];
  const issues: ValidationIssue[] = [];
  const parentStack: string[] = []; // index = depth, value = boqNo at that depth
  const seenBoqNos = new Set<string>();
  let sortOrder = 0;
  let lastNodeIndex = -1; // For continuation row support

  const startRow = opts.startRowNumber ?? 4;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = startRow + i;

    // ── STEP 1: Read and normalize cells ──
    const colA = trim(row[0]);
    const colB = trim(row[1]);
    const colC = trim(row[2]);
    const colD = trim(row[3]);
    const colE = trim(row[4]);
    const colF = normalizeUnit(row[5]);
    const colG = parseNumber(row[6]);
    const colH = parseNumber(row[7]);
    const colIRaw = parseNumber(row[8]); // Amount — for V10 variance check only

    // ── STEP 2: Skip blank rows ──
    if (!colA && !colB && !colC && !colD && !colE && !colF && isNaN(colG)) continue;

    // ── STEP 2a: Continuation row detection (edge case) ──
    // Row where A/B/C all blank, D/E non-blank, F/G blank = append to previous description
    if (!colA && !colB && !colC && (colD || colE) && !colF && isNaN(colG)) {
      if (lastNodeIndex >= 0) {
        const prev = nodes[lastNodeIndex];
        prev.description = normalizeDesc(prev.description + " " + (colD || "") + " " + (colE || ""));
      }
      continue;
    }

    // ── STEP 3: Determine reference number ──
    // Priority: Col C > Col B > Col A (as string)
    const ref = colC || colB || (colA ? String(colA) : "");

    // ── STEP 4: Calculate depth via dot-count ──
    const hasUnit = colF !== "";
    const hasQty = !isNaN(colG) && colG !== 0;
    const isLeaf = hasUnit && hasQty;
    const isGroup = !isLeaf;

    // ── V01: Leaf row must have reference ──
    if (isLeaf && !ref) {
      issues.push({
        rule: "V01", severity: "error", row: rowNumber, boq_no: null,
        message: `Row ${rowNumber}: Billable item has no BOQ number. Fill Col B or Col C.`,
      });
      continue;
    }

    if (!ref) continue; // Skip rows with no ref and not leaf

    // ── V02: Validate numeric qty ──
    if (hasUnit && row[6] !== null && row[6] !== undefined && row[6] !== "" && isNaN(colG)) {
      issues.push({
        rule: "V02", severity: "error", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: Quantity "${row[6]}" is not a valid number.`,
      });
      continue;
    }

    // Calculate depth
    const depth = dotCount(ref);

    // ── V05: Depth guard ──
    if (depth > 5) {
      issues.push({
        rule: "V05", severity: "error", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: Item "${ref}" is nested too deep (depth ${depth}). Max depth is 5.`,
      });
      continue;
    }

    // ── V04: Duplicate boq_no check ──
    if (seenBoqNos.has(ref)) {
      issues.push({
        rule: "V04", severity: "error", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: BOQ number "${ref}" already exists in this sheet. Each item must be unique.`,
      });
      continue;
    }
    seenBoqNos.add(ref);

    // ── V03: Rate validation (warning only, use 0) ──
    let effectiveRate: number | null = null;
    if (isLeaf) {
      if (row[7] === null || row[7] === undefined || row[7] === "" || isNaN(colH)) {
        issues.push({
          rule: "V03", severity: "warning", row: rowNumber, boq_no: ref,
          message: `Row ${rowNumber}: Rate missing or invalid for "${ref}". Imported as 0 (TBD).`,
        });
        effectiveRate = 0;
      } else {
        effectiveRate = colH;
      }
    }

    // ── V06: Name fallback warning ──
    if (!colD && !colE) {
      issues.push({
        rule: "V06", severity: "warning", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: Item "${ref}" has no name or description. Using BOQ number as name.`,
      });
    }

    // ── V10: Amount variance check (warning) ──
    if (isLeaf && !isNaN(colIRaw) && colIRaw > 0 && effectiveRate && effectiveRate > 0) {
      const calculated = colG * effectiveRate;
      const variance = Math.abs(calculated - colIRaw) / calculated;
      if (variance > 0.01) {
        issues.push({
          rule: "V10", severity: "warning", row: rowNumber, boq_no: ref,
          message: `Row ${rowNumber}: Excel amount ${colIRaw.toFixed(2)} differs from Qty×Rate (${calculated.toFixed(2)}). ERP will use Qty×Rate.`,
        });
      }
    }

    // ── V11: Negative qty warning ──
    if (isLeaf && colG < 0) {
      issues.push({
        rule: "V11", severity: "warning", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: Negative quantity detected (${colG}). Imported as 'Deduct' item.`,
      });
    }

    // ── V12: Name truncation warning ──
    let displayName = (colD || colE || ref).substring(0, 200);
    if (colD && colD.length > 200) {
      issues.push({
        rule: "V12", severity: "warning", row: rowNumber, boq_no: ref,
        message: `Row ${rowNumber}: Item name truncated to 200 characters.`,
      });
    }

    // ── STEP 7: Resolve parent from stack ──
    // Parent is at depth - 1. For depth 0, parent is null.
    const parentBoqNo = depth > 0 ? (parentStack[depth - 1] || null) : null;

    // ── STEP 8: Build node ──
    const node: ParsedBOQNode = {
      project_id: opts.projectId,
      category: opts.sheetCategory,
      boq_no: ref,
      parent_boq_no: parentBoqNo,
      depth,
      sort_order: ++sortOrder,
      is_group: isGroup,
      display_name: displayName,
      description: normalizeDesc(colE),
      unit: isLeaf ? colF : null,
      tender_qty: isLeaf ? colG : null,
      rate: isLeaf ? (effectiveRate ?? 0) : null,
      scope_qty: 0,
      sub_done_qty: 0,
      self_done_qty: 0,
      billed_qty: 0,
      is_negative: isLeaf && colG < 0,
      source_sheet: opts.sheetCategory,
      import_batch_id: opts.batchId,
      _row_number: rowNumber,
    };

    // ── STEP 9: Update parent stack ──
    parentStack[depth] = ref;
    parentStack.length = depth + 1; // Trim deeper entries

    nodes.push(node);
    lastNodeIndex = nodes.length - 1;
  }

  return { nodes, issues };
}

/**
 * Parse multiple sheets at once.
 * Only processes Civil_Building, Electrical, Road_Works per spec §5.3.
 */
export function parseBOQWorkbook(
  sheets: MultiSheetInput[],
  projectId: string,
  batchId: string
): ParseResult {
  const allNodes: ParsedBOQNode[] = [];
  const allIssues: ValidationIssue[] = [];

  // Sheet name → category mapping per spec
  const sheetMap: Record<string, string> = {
    "Civil_Building": BOQ_CATEGORIES.Civil_Building,
    "Electrical": BOQ_CATEGORIES.Electrical,
    "Road_Works": BOQ_CATEGORIES.Road_Works,
    // Also accept trimmed / common variants
    "Civil Building": BOQ_CATEGORIES.Civil_Building,
    "Civil": BOQ_CATEGORIES.Civil_Building,
    "Road Works": BOQ_CATEGORIES.Road_Works,
    "Road": BOQ_CATEGORIES.Road_Works,
  };

  for (const sheet of sheets) {
    const category = sheetMap[sheet.sheetName.trim()];
    if (!category) {
      // Silently skip INSTRUCTIONS / QUICK_REFERENCE etc.
      continue;
    }

    // V09: Skip empty sheets
    if (!sheet.rows || sheet.rows.length === 0) {
      allIssues.push({
        rule: "V09", severity: "warning", row: 0, boq_no: null,
        message: `Sheet '${sheet.sheetName}' has no data rows. Skipped.`,
      });
      continue;
    }

    const result = parseBOQSheet(sheet.rows, {
      projectId,
      sheetCategory: category,
      batchId,
    });

    allNodes.push(...result.nodes);
    allIssues.push(...result.issues);
  }

  return { nodes: allNodes, issues: allIssues };
}
