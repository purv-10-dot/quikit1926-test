/**
 * Dual BOQ Import Engine — shared types
 *
 * One canonical row shape (NormalizedBoqRow) is produced by EITHER adapter
 * and consumed by the shared pipeline (normalize → validate → hierarchy →
 * persist). Adding a third format later means writing a new adapter that
 * produces NormalizedBoqRow — nothing else changes.
 */

export type ImportMode =
  | "STRICT_TEMPLATE"
  | "GENERIC_SOR"
  | "ALPHABETIC_SOR"  // alias of GENERIC_SOR — dedicated preset for
                     // alphabetic SOR sheets (I/NO., SOR Numbers,
                     // A.1 / A.2.2.1 / a. / b. pattern)
  | "UNIVERSAL";

export type ImportSeverity = "error" | "warning" | "info";

export interface ImportIssue {
  code: string;            // e.g. UNSUPPORTED_FORMAT, DUPLICATE_BOQ_NO_IN_CATEGORY
  severity: ImportSeverity;
  message: string;
  sheet?: string;
  rowNumber?: number;      // 1-based source row number
  boqNo?: string | null;
  field?: string;
}

/**
 * A single spreadsheet cell value as SheetJS emits it in `header: 1` mode —
 * a string, number, boolean, Date (when `cellDates` is on), or null/blank.
 * Never an object, so the adapters can read cells through the `cell-utils`
 * helpers without an untyped escape hatch.
 */
export type SheetCell = string | number | boolean | Date | null;

/**
 * Raw cell grid for a single workbook tab — what comes out of XLSX.utils
 * .sheet_to_json with `header: 1`. Adapter input.
 */
export interface RawSheet {
  sheetName: string;
  rows: SheetCell[][];     // each row = array of cell values, may have nulls
}

/**
 * Output of an adapter for one source row, BEFORE the shared pipeline
 * resolves hierarchy and assigns sortOrder. The adapter is responsible for
 * extracting raw values + filling sourceRowNumber + a tentative isGroup.
 */
export interface NormalizedBoqRow {
  // ── Tenant + project (filled by pipeline before validation) ─────
  projectId: string;
  orgId: string;

  // ── Origin tracking ─────────────────────────────────────────────
  importMode: ImportMode;
  importBatchId: string | null;
  category: string;            // resolved by category-map
  sourceSheet: string;         // raw sheet name (untouched)
  sourceRowNumber: number;     // 1-based source row in the sheet

  // ── Raw refs (preserved verbatim for audit) ─────────────────────
  rawSerialNo: string | null;  // generic only — Col A "S.No."
  rawSorNo: string | null;     // generic = Col B; strict = "SOR No"
  rawSubNo: string | null;     // generic = Col C
  rawBoqNo: string | null;     // strict = Col A "BOQ No"; generic derives

  // ── Resolved hierarchy (filled by pipeline) ─────────────────────
  boqNo: string;               // canonical key (unique within project+category)
  parentBoqNo: string | null;
  depth: number;               // 0..5, capped to 5
  sortOrder: number;           // assigned by pipeline (preserves source order)

  // ── Classification ──────────────────────────────────────────────
  isGroup: boolean;            // true for headers, false for billable items

  // ── Display ─────────────────────────────────────────────────────
  displayName: string;         // truncated to 200 chars
  itemName: string;            // raw "Item Name" / "Description" cell
  description: string;         // long description, truncated to 1000

  // ── Quantities + money (Decimal precision preserved as strings) ─
  unit: string | null;
  tenderQty: number | null;    // Col G in generic, "Op. Undone Qty" in strict
  rate: number | null;         // Col H in generic, "Rate" in strict
  estimateAmt: number | null;  // computed = tenderQty * rate (audit only)
  excelAmount: number | null;  // raw Col I in generic — cross-check only

  // Operational seeds (pipeline initialises to 0)
  scopeQty: number;
  subDoneQty: number;
  selfDoneQty: number;
  billedQty: number;

  // ── Per-row issue trail ────────────────────────────────────────
  warnings: ImportIssue[];
}

/**
 * Adapter return value for one sheet. The pipeline merges results across
 * sheets, then runs hierarchy/validation/persist.
 */
export interface AdapterSheetResult {
  sheetName: string;
  category: string;
  rows: NormalizedBoqRow[];
  issues: ImportIssue[];        // sheet-level issues (skipped, header missing, etc.)
  detectedColumns?: Record<string, number>; // column-letter → index for debugging
}

/** Adapter-level summary across all sheets in a workbook. */
export interface AdapterRunResult {
  mode: ImportMode;
  sheets: AdapterSheetResult[];
  issues: ImportIssue[];        // workbook-level
}

/**
 * Detector verdict for a single sheet. The pipeline rolls these up to the
 * workbook level — if every parseable sheet says STRICT we use STRICT;
 * if any says GENERIC and none say STRICT we use GENERIC; mixed = warn +
 * fall back to user-selected.
 */
export interface DetectedSheet {
  sheetName: string;
  detectedMode: ImportMode | "UNKNOWN";
  confidence: number;           // 0..1
  reason: string;
  headerRowIndex?: number;      // for generic, the row that contains "S.No."
}

export interface DetectionResult {
  workbookMode: ImportMode | "UNKNOWN";
  perSheet: DetectedSheet[];
}

/**
 * Top-level pipeline output returned to the API layer. The shape is stable
 * — both /preview-upload and /import return this (preview-upload omits the
 * `inserted` block; import populates it).
 */
export interface PipelineResult {
  mode: ImportMode;
  detectedMode: ImportMode | "UNKNOWN";
  supportedModes: ImportMode[];
  detection: DetectionResult;
  rows: NormalizedBoqRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: {
    totalRows: number;
    leafItems: number;
    groupHeaders: number;
    sheetsParsed: number;
    sheetsSkipped: number;
    perCategory: Record<string, number>;
  };
  sampleRows: NormalizedBoqRow[]; // first 10 leaves, for UI preview
}

export interface PipelineOptions {
  projectId: string;
  orgId: string;
  importBatchId: string | null;
  selectedMode?: ImportMode | "AUTO";  // user-forced or auto-detect
  // Universal-mode only: per-sheet column mapping supplied by the user.
  // Ignored for STRICT_TEMPLATE / GENERIC_SOR / AUTO.
  universalMapping?: import("./universal-adapter").UniversalMapping;
}
