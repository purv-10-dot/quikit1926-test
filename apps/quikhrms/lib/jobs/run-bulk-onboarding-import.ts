import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processBulkOnboardingCandidates } from "@/lib/services/bulk-onboarding";
import { createAuditLog } from "@/lib/utils/audit";
import { bulkOnboardingRowSchema } from "@/lib/validations/boarding";

const rowsSchema = z.array(bulkOnboardingRowSchema);

export interface BulkOnboardingImportArgs {
  orgId: string;
  userId: string;
  importId: string;
  rows: unknown[];
  dryRun: boolean;
}

/**
 * In-process bulk onboarding-candidate import. Runs via runBackground() from the
 * bulk-import route; updates the DataImport status row as it progresses (the UI
 * polls GET /onboarding/candidates/bulk-import/[importId]).
 */
export async function runBulkOnboardingImport(args: BulkOnboardingImportArgs): Promise<void> {
  const { orgId, userId, importId, rows, dryRun } = args;

  await prisma.dataImport.updateMany({
    where: { id: importId, orgId },
    data: { status: "ImportProcessing" },
  });

  const parsedRows = rowsSchema.parse(rows);
  const result = await processBulkOnboardingCandidates(orgId, userId, parsedRows, dryRun);

  await prisma.dataImport.update({
    where: { id: importId },
    data: {
      processedRows: result.success + result.failed,
      successRows: result.success,
      failedRows: result.failed,
      errors: result.errors.length > 0 ? JSON.parse(JSON.stringify(result.errors)) : undefined,
      status:
        result.failed === 0
          ? "ImportCompleted"
          : result.success === 0
            ? "ImportFailed"
            : "ImportPartial",
    },
  });

  await createAuditLog({
    orgId,
    userId,
    action: "Import",
    entityType: "Employee",
    metadata: { importId, onboarding: true, success: result.success, failed: result.failed, dryRun },
  });
}

/** Mark a stuck/failed import record failed (used as runBackground onError). */
export async function markOnboardingImportFailed(importId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : "Unknown error";
  await prisma.dataImport
    .update({
      where: { id: importId },
      data: { status: "ImportFailed", errors: [{ row: 0, error: msg }] },
    })
    .catch(() => {});
}
