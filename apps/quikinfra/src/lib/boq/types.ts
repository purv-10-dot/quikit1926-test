/**
 * BOQ Types — per Aakar BOQ Import Developer Spec v2.0
 *
 * Canonical types for BOQ items, imports, and validation results.
 * All field names match the spec's DB schema.
 */

// ─── Categories (sheet → category mapping) ──────────────────────────

export const BOQ_CATEGORIES = {
  Civil_Building: "Civil Building",
  Electrical: "Electrical",
  Road_Works: "Road Works",
} as const;

export type BOQCategory = typeof BOQ_CATEGORIES[keyof typeof BOQ_CATEGORIES];

// ─── BOQ Item (per spec §4.1) ───────────────────────────────────────

export interface BOQItem {
  id: string;
  project_id: string;
  category: BOQCategory | string;

  // Hierarchy
  boq_no: string;                  // e.g. "4.1.1.4"
  parent_boq_no: string | null;    // null = root
  depth: number;                   // 0..5
  sort_order: number;              // preserves Excel sequence
  is_group: boolean;

  // Display
  display_name: string;            // Col D
  description: string;             // Col E
  unit: string | null;             // Col F (null for groups)

  // Imported (static after lock)
  tender_qty: number | null;       // Col G
  rate: number | null;             // Col H
  estimate_amt: number;            // tender_qty * rate (stored for perf)

  // Operational (updated during execution)
  scope_qty: number;
  sub_done_qty: number;            // From DPR (sub-contractor)
  self_done_qty: number;           // From DPR (self)
  billed_qty: number;              // From RAB

  // Schedule (optional, planner-supplied)
  start_date: string | null;       // YYYY-MM-DD
  end_date: string | null;         // YYYY-MM-DD

  // Metadata
  is_negative: boolean;            // "Deduct" items (qty < 0)
  source_sheet: string;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Computed columns — NEVER stored, always calculated at query time (spec §4.2) */
export interface BOQItemComputed extends BOQItem {
  done_qty: number;               // sub + self
  balance_qty: number;            // tender - done
  balance_estimate: number;       // balance * rate
  billed_amount: number;          // billed_qty * rate
  completion_pct: number;         // (done / tender) * 100
  estimate_amt_rollup: number;    // for groups: sum of descendants
}

// ─── Import Batch (for audit + rollback) ────────────────────────────

export interface BOQImportBatch {
  id: string;
  project_id: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  status: "processing" | "preview_ready" | "imported" | "failed" | "cancelled";
  error_detail?: any;
  file_name?: string;
  row_count?: number;
  created_at: string;
}

// ─── Parser Input/Output ────────────────────────────────────────────

/** Raw row from Excel parser — 9 cells (A-I) */
export type ExcelRow = [
  string | number | null, // A - S.No
  string | null,          // B - SOR Item No
  string | null,          // C - SOR Sub Item No
  string | null,          // D - Item Name
  string | null,          // E - Description
  string | null,          // F - Unit
  string | number | null, // G - Quantity
  string | number | null, // H - Rate
  string | number | null, // I - Amount (ignored)
];

export interface ParsedBOQNode {
  project_id: string;
  category: string;
  boq_no: string;
  parent_boq_no: string | null;
  depth: number;
  sort_order: number;
  is_group: boolean;
  display_name: string;
  description: string;
  unit: string | null;
  tender_qty: number | null;
  rate: number | null;
  scope_qty: number;
  sub_done_qty: number;
  self_done_qty: number;
  billed_qty: number;
  is_negative: boolean;
  source_sheet: string;
  import_batch_id: string | null;
  start_date?: string | null;       // Optional planned start (YYYY-MM-DD)
  end_date?: string | null;         // Optional planned end (YYYY-MM-DD)
  _row_number?: number; // for error reporting
}

// ─── Validation ─────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  rule: string;                    // V01..V12
  severity: ValidationSeverity;
  row: number;
  boq_no: string | null;
  message: string;
}

export interface ImportPreview {
  batchId: string;
  totalRows: number;
  leafItems: number;
  groupHeaders: number;
  categories: Record<string, number>;
  nodes: ParsedBOQNode[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  requiresConfirmation: boolean;
}

/** Multi-sheet parser input — one entry per workbook tab */
export interface MultiSheetInput {
  sheetName: string;
  rows: ExcelRow[];
}

// ─── BOQ Project Lock Metadata ──────────────────────────────────────

export interface BOQLockState {
  project_id: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  version: number;
}
