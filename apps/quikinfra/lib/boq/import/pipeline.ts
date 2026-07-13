/**
 * Dual BOQ Import Pipeline — orchestrator
 *
 * Stages:
 *   1. detectImportMode(sheets)
 *   2. dispatch to strict OR generic adapter (or user-forced mode)
 *   3. flatten adapter output → NormalizedBoqRow[]
 *   4. enrich rows with projectId / orgId / batchId
 *   5. resolveHierarchy (parent + sortOrder)
 *   6. validateNormalizedRows (cross-row invariants)
 *   7. summarise (counts per category, sample rows)
 *
 * Returns a PipelineResult that BOTH /preview-upload and /import consume.
 * Persistence is the caller's responsibility — this module never touches
 * the database, so it stays unit-testable in isolation.
 */

import type {
  ImportIssue,
  ImportMode,
  NormalizedBoqRow,
  PipelineOptions,
  PipelineResult,
  RawSheet,
} from "./types";
import { detectImportMode } from "./detector";
import { runStrictAdapter } from "./strict-adapter";
import { runGenericAdapter } from "./generic-adapter";
import { runUniversalAdapter } from "./universal-adapter";
import { resolveHierarchy } from "./hierarchy";
import { validateNormalizedRows } from "./validator";

const SUPPORTED_MODES: ImportMode[] = [
  "STRICT_TEMPLATE",
  "GENERIC_SOR",
  "ALPHABETIC_SOR",
  "UNIVERSAL",
];

export function runImportPipeline(
  sheets: RawSheet[],
  opts: PipelineOptions
): PipelineResult {
  // ── Stage 1: detection ────────────────────────────────────────
  const detection = detectImportMode(sheets);

  // ── Stage 2: pick a mode ──────────────────────────────────────
  // Resolution order:
  //   - explicit user-forced mode (other than AUTO) wins
  //   - else workbook-level detection
  //   - else fall back to GENERIC_SOR (more permissive)
  let mode: ImportMode;
  if (opts.selectedMode && opts.selectedMode !== "AUTO") {
    mode = opts.selectedMode;
  } else if (detection.workbookMode === "STRICT_TEMPLATE" || detection.workbookMode === "GENERIC_SOR") {
    mode = detection.workbookMode;
  } else {
    mode = "GENERIC_SOR";
  }

  // ── Stage 3: dispatch to adapter ──────────────────────────────
  let adapterResult;
  if (mode === "UNIVERSAL") {
    if (!opts.universalMapping) {
      // No mapping supplied — return an empty pipeline result with a clear
      // error so the caller knows to collect the mapping from the user first.
      return {
        mode,
        detectedMode: detection.workbookMode,
        supportedModes: SUPPORTED_MODES,
        detection,
        rows: [],
        errors: [{
          code: "UNIVERSAL_MAPPING_REQUIRED",
          severity: "error",
          message:
            "Universal import requires a column mapping. Call /detect-columns first, " +
            "have the user confirm the mapping, then submit it with the preview-upload request.",
        }],
        warnings: [],
        summary: {
          totalRows: 0, leafItems: 0, groupHeaders: 0,
          sheetsParsed: 0, sheetsSkipped: sheets.length,
          perCategory: {},
        },
        sampleRows: [],
      };
    }
    adapterResult = runUniversalAdapter(sheets, opts.universalMapping);
  } else if (mode === "STRICT_TEMPLATE") {
    adapterResult = runStrictAdapter(sheets);
  } else {
    // GENERIC_SOR and ALPHABETIC_SOR share the same adapter. The latter is
    // a cosmetic preset for users whose sheets use alphabetic numbering
    // (A.1 / A.2.2.1 / a. / b.) — the generic adapter already handles it
    // via column aliases and most-dotted-ref resolution.
    adapterResult = runGenericAdapter(sheets);
  }

  // ── Stage 4: flatten + enrich ─────────────────────────────────
  const allRows: NormalizedBoqRow[] = [];
  const sheetIssues: ImportIssue[] = [];
  let sheetsParsed = 0;
  let sheetsSkipped = 0;

  for (const s of adapterResult.sheets) {
    sheetIssues.push(...s.issues);
    if (s.rows.length === 0) {
      sheetsSkipped++;
      continue;
    }
    sheetsParsed++;
    for (const r of s.rows) {
      r.projectId = opts.projectId;
      r.orgId = opts.orgId;
      r.importBatchId = opts.importBatchId;
      allRows.push(r);
    }
  }

  // ── Stage 5: hierarchy resolution ─────────────────────────────
  const hier = resolveHierarchy(allRows);

  // ── Stage 6: validation ───────────────────────────────────────
  const val = validateNormalizedRows(hier.rows);

  // Aggregate issues from all stages
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  for (const i of sheetIssues) {
    if (i.severity === "error") errors.push(i);
    else warnings.push(i);
  }
  for (const i of hier.issues) {
    if (i.severity === "error") errors.push(i);
    else warnings.push(i);
  }
  errors.push(...val.errors);
  warnings.push(...val.warnings);

  // ── Stage 7: summary ──────────────────────────────────────────
  const perCategory: Record<string, number> = {};
  for (const r of val.rows) {
    perCategory[r.category] = (perCategory[r.category] ?? 0) + 1;
  }

  const sampleRows = val.rows.filter((r) => !r.isGroup).slice(0, 10);

  return {
    mode,
    detectedMode: detection.workbookMode,
    supportedModes: SUPPORTED_MODES,
    detection,
    rows: val.rows,
    errors,
    warnings,
    summary: {
      totalRows: val.rows.length,
      leafItems: val.rows.filter((r) => !r.isGroup).length,
      groupHeaders: val.rows.filter((r) => r.isGroup).length,
      sheetsParsed,
      sheetsSkipped,
      perCategory,
    },
    sampleRows,
  };
}
