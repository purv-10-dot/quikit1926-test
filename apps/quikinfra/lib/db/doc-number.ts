/**
 * Auto-incrementing document number generators.
 *
 * Two formats live here, both Postgres-backed:
 *   1) Tenant-scoped, calendar year — `{PREFIX}-{YYYY}-{NNNNN}` —
 *      via `generateDocNumber`. Used for tenant-wide docs (RAB, REC).
 *
 *   2) Project-scoped, FY — `{PREFIX}-{ProjectCode}-{FY}-{NNNN}` —
 *      via `nextProjectScopedDocNumber`. Used for the procurement chain
 *      (PR, IND, RFQ, PO, GRN). Mirrors the legacy in-memory format that
 *      lived in `src/lib/purchase-engine.ts:generateDocNumber`, but
 *      backed by a Postgres "highest matching suffix + 1" scan so the
 *      counter survives restarts and HMR. The unique constraints on each
 *      doc-number column will throw P2002 under concurrent inserts —
 *      callers should wrap creates in `withDocNumberRetry`.
 */

import { toErrorMessage, getErrorCode , getErrorMeta} from "@/lib/api/errors";
import { db } from "@/lib/db";

const PREFIXES: Record<string, { model: string; field: string; prefix: string }> = {
  pr: { model: "cnPurchaseRequisition", field: "prNumber", prefix: "PR" },
  indent: { model: "cnPurchaseIndent", field: "indentNumber", prefix: "IND" },
  po: { model: "cnPurchaseOrder", field: "poNumber", prefix: "PO" },
  grn: { model: "cnGoodsReceiptNote", field: "grnNumber", prefix: "GRN" },
  issue: { model: "cnMaterialIssue", field: "issueNumber", prefix: "ISS" },
  gatepass: { model: "cnGatePass", field: "gatePassNumber", prefix: "GP" },
  return_vendor: { model: "cnGoodReturn", field: "returnNumber", prefix: "GR" },
  transfer: { model: "cnStockTransfer", field: "transferNumber", prefix: "TRF" },
  reconciliation: { model: "cnStockReconciliation", field: "reconciliationNumber", prefix: "REC" },
  wo: { model: "cnWorkOrder", field: "woNumber", prefix: "WO" },
  dpr: { model: "cnDailyProgressReport", field: "dprNumber", prefix: "DPR" },
  rab: { model: "cnRunningAccountBill", field: "rabNumber", prefix: "RAB" },
};

export async function generateDocNumber(
  type: keyof typeof PREFIXES,
  orgId: string
): Promise<string> {
  const config = PREFIXES[type];
  if (!config) throw new Error(`Unknown doc type: ${type}`);

  const year = new Date().getFullYear();
  const prefix = `${config.prefix}-${year}-`;

  const count = await (db as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[config.model].count({
    where: {
      orgId,
      [config.field]: { startsWith: prefix },
    },
  });

  const seq = String(count + 1).padStart(5, "0");
  return `${prefix}${seq}`;
}

// ─── Project-scoped, FY-style doc numbers ────────────────────────────
//
// Map of "logical doc kind" → which Prisma model + which doc-number
// column to scan. Add a new entry here when a new project-scoped
// document kind is introduced; routes should not pass model/field
// strings inline.
const PROJECT_SCOPED: Record<
  string,
  { model: string; field: string; prefix: string }
> = {
  pr: { model: "cnPurchaseRequisition", field: "prNumber", prefix: "PR" },
  indent: { model: "cnPurchaseIndent", field: "indentNumber", prefix: "IND" },
  rfq: { model: "cnRfq", field: "rfqNumber", prefix: "RFQ" },
  po: { model: "cnPurchaseOrder", field: "poNumber", prefix: "PO" },
  grn: { model: "cnGoodsReceiptNote", field: "grnNumber", prefix: "GRN" },
};

function extractTrailingSeq(docNumber: string): number {
  // Matches the tail "-####" of "{PREFIX}-{CODE}-{FY}-####"
  const m = docNumber.match(/-(\d+)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Generate the next project-scoped doc number.
 *
 * Format: `{PREFIX}-{projectCode}-{fy}-{NNNN}`.
 * Strategy: read every existing doc number for this tenant/org with the
 * matching prefix, find the highest numeric suffix, return +1. Racy
 * under concurrent creates — wrap your create in `withDocNumberRetry`.
 */
export async function nextProjectScopedDocNumber(opts: {
  type: keyof typeof PROJECT_SCOPED;
  orgId: string;
  projectCode: string;
  fy?: string;
}): Promise<string> {
  const config = PROJECT_SCOPED[opts.type];
  if (!config) throw new Error(`Unknown project-scoped doc type: ${opts.type}`);
  const fy = opts.fy ?? "26";
  const prefix = `${config.prefix}-${opts.projectCode}-${fy}-`;
  const rows: Array<Record<string, string>> = await (db as unknown as Record<string, { findMany: (args: unknown) => Promise<Array<Record<string, string>>> }>)[config.model].findMany({
    where: {
      orgId: opts.orgId,
      [config.field]: { startsWith: prefix },
    },
    select: { [config.field]: true },
  });
  const maxSeq = rows.reduce((max, r) => {
    const n = extractTrailingSeq(r[config.field]);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

/**
 * Run `task` with a freshly-generated doc number; if it throws P2002
 * (unique-constraint conflict) on the doc-number column, regenerate
 * and retry up to `maxAttempts` times. Handles the race where two
 * concurrent creates both pick the same next number.
 */
export async function withDocNumberRetry<T>(
  generate: () => Promise<string>,
  task: (docNumber: string) => Promise<T>,
  fieldName: string,
  maxAttempts: number = 5,
): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < maxAttempts; i++) {
    const docNumber = await generate();
    try {
      return await task(docNumber);
    } catch (err: unknown) {
      const isConflict =
        getErrorCode(err) === "P2002" &&
        Array.isArray(getErrorMeta(err)?.target) &&
        (getErrorMeta(err)?.target as unknown[]).includes(fieldName);
      if (!isConflict) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
