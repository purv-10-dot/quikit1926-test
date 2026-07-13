/**
 * BOQ Module — Barrel Export
 */
export * from "./types";
export * from "./parser";
export { applyRollup, computeBOQSummary } from "./rollup";
export { boqRepository, BOQRepository } from "./repository";
export { boqService, BOQService, BOQError } from "./service";
export { postProgressEntry, ProgressLedgerError } from "./progress-ledger";
export { postBillingEntry, BillingLedgerError } from "./billing-ledger";

// Dual BOQ Import Engine (strict + generic adapters)
export {
  runImportPipeline,
  detectImportMode,
  resolveCategory,
  CANONICAL_CATEGORIES,
} from "./import";
export type {
  ImportMode,
  NormalizedBoqRow,
  PipelineResult,
  PipelineOptions,
  ImportIssue,
  RawSheet,
  SheetCell,
  DetectionResult,
  DetectedSheet,
} from "./import";
