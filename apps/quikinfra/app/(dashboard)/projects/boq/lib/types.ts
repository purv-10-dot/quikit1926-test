/**
 * Shared types for the BOQ Import drawer.
 *
 * Extracted verbatim from BOQImportDrawer.tsx as part of the god-file
 * decomposition. Pure type declarations — no runtime code.
 */

export type ImportMode =
  | "AUTO"
  | "STRICT_TEMPLATE"
  | "GENERIC_SOR"
  | "ALPHABETIC_SOR"
  | "SELF_FILL"
  | "UNIVERSAL";

// Standard BOQ fields a user can map a detected column to (spec §1.1 + §4).
// Kept in sync with UniversalField in src/lib/boq/import/universal-adapter.ts.
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

// Field groups per Column Mapper Spec v1.0 §2.3. Drives the <optgroup>
// structure in the mapping dropdown and the color dots on the coverage pills.
export type UniversalGroup = "Identity" | "Quantities" | "Amounts";

export interface DetectedColumn {
  index: number;
  name: string;
  samples: string[];
  suggested: UniversalField;
  confidence: number;
}

export interface DetectedSheetColumns {
  sheetName: string;
  headerRowIndex: number;
  headerScore: number;
  columns: DetectedColumn[];
}

export interface DetectColumnsResponse {
  fileName: string;
  fileSize: number;
  sheets: DetectedSheetColumns[];
}

export interface ImportIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  sheet?: string;
  rowNumber?: number;
  boqNo?: string | null;
  field?: string;
}

export interface NormalizedBoqRow {
  category: string;
  sourceSheet: string;
  sourceRowNumber: number;
  boqNo: string;
  parentBoqNo: string | null;
  depth: number;
  isGroup: boolean;
  displayName: string;
  description: string;
  unit: string | null;
  tenderQty: number | null;
  rate: number | null;
  estimateAmt: number | null;
  importMode: "STRICT_TEMPLATE" | "GENERIC_SOR";
  warnings?: ImportIssue[];
}

export interface DetectedSheet {
  sheetName: string;
  detectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "UNKNOWN";
  confidence: number;
  reason: string;
  headerRowIndex?: number;
}

export interface PreviewData {
  fileName: string;
  fileSize: number;
  selectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL";
  detectedMode: "STRICT_TEMPLATE" | "GENERIC_SOR" | "ALPHABETIC_SOR" | "UNIVERSAL" | "UNKNOWN";
  supportedModes: string[];
  detection: { workbookMode: string; perSheet: DetectedSheet[] };
  summary: {
    totalRows: number;
    leafItems: number;
    groupHeaders: number;
    sheetsParsed: number;
    sheetsSkipped: number;
    perCategory: Record<string, number>;
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
  sampleRows: NormalizedBoqRow[];
  rows: NormalizedBoqRow[]; // full set for confirm round-trip
}

export type Stage =
  | "pick"
  | "parsing"          // running the auto/strict/generic preview
  | "detecting"        // Universal: detect-columns in flight
  | "mapping"          // Universal: user is reviewing/editing column mapping
  | "preview"
  | "confirming"
  | "done";

// Self-Fill tree model — user builds parent groups with children that are either
// leaves (hold qty/rate directly, no sub-items) or groups (contain line items).
// String inputs so fields can be cleared while typing; parsed when flattened.
export interface SFLineItem {
  id: string;
  /** Override the last numeric segment of the BOQ No (e.g. "3" for 2.7.3).
   *  Empty string falls back to the sequential position (1-based). */
  boqNoOverride: string;
  displayName: string;
  unit: string;
  tenderQty: string;
  rate: string;
}

export type SFChildMode = "leaf" | "group";

export interface SFChild {
  id: string;
  /** Override the last numeric segment (e.g. "6" → "2.6"). Empty = auto. */
  boqNoOverride: string;
  mode: SFChildMode;
  displayName: string;
  // leaf fields (used when mode === "leaf")
  unit: string;
  tenderQty: string;
  rate: string;
  // group fields (used when mode === "group")
  lineItems: SFLineItem[];
}

export interface SFParent {
  id: string;
  /** Override the top-level BOQ No (e.g. "4"). Empty = auto. */
  boqNoOverride: string;
  displayName: string;
  children: SFChild[];
}