/**
 * Import queue — BullMQ/Redis has been removed.
 *
 * The queue backend is disabled: `enqueueImport` is a no-op that reports the
 * disabled state. Import routes still guard with `requireRedisOr503()` (which
 * now always returns 503), so this is never reached on the happy path. Types and
 * the job-id helper are kept so callers and tests need no changes.
 */

export interface ImportJobData {
  orgId: string;
  jobId: string; // LeadImportJob.id (Postgres)
  entityType: "leads" | "activities" | "workflows" | "sla";
  batchId?: string;
}

const QUEUE_NAME = "imports";

/** Retained for callers/tests. (BullMQ forbade colons in custom job ids.) */
export function buildImportBullJobId(entityType: string, jobId: string): string {
  return `${entityType}-${jobId}`;
}

/**
 * No-op. Background import processing is disabled (no BullMQ/Redis). Returns the
 * would-be job id so callers that log it keep working; nothing is actually
 * queued or processed.
 */
export async function enqueueImport(
  data: ImportJobData,
  _opts: { delayMs?: number } = {},
): Promise<string> {
  return buildImportBullJobId(data.entityType, data.jobId);
}

export const IMPORT_QUEUE_NAME = QUEUE_NAME;
