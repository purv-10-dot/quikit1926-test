import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processBulkEmployees } from "@/lib/services/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";
import { bulkEmployeeRowSchema } from "@/lib/validations/gap-fill";

export interface BulkImportArgs {
  orgId: string;
  userId: string;
  importId: string;
  rows: unknown[];
  dryRun: boolean;
  markActive: boolean;
}

/**
 * In-process bulk employee import (was the BullMQ worker processor). Runs via
 * runBackground() from the bulk-import route; updates the DataImport status row
 * as it progresses (the UI polls GET /employees/bulk-import/[importId]). Invite
 * emails are sent inline. No queue, no realtime publish.
 */
export async function runBulkEmployeeImport(args: BulkImportArgs): Promise<void> {
  const { orgId, userId, importId, rows, dryRun, markActive } = args;

  await prisma.dataImport.updateMany({
    where: { id: importId, orgId },
    data: { status: "ImportProcessing" },
  });

  // Validate each row individually so ONE malformed value (e.g. a bad PAN or
  // IFSC) becomes that row's error instead of aborting the whole import. Track
  // the original file row number so processing errors can be mapped back to it.
  const schemaErrors: Array<{ row: number; error: string }> = [];
  const validRows: z.infer<typeof bulkEmployeeRowSchema>[] = [];
  const originalRowNums: number[] = [];
  rows.forEach((raw, i) => {
    const res = bulkEmployeeRowSchema.safeParse(raw);
    if (res.success) {
      validRows.push(res.data);
      originalRowNums.push(i + 1);
    } else {
      const msg = res.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`).join("; ");
      schemaErrors.push({ row: i + 1, error: msg || "Invalid row" });
    }
  });

  const result = await processBulkEmployees(orgId, userId, validRows, dryRun, markActive);
  // Remap processing errors (indexed within validRows) back to original file rows.
  const processingErrors = result.errors.map((e) => ({ ...e, row: originalRowNums[e.row - 1] ?? e.row }));
  const allErrors = [...schemaErrors, ...processingErrors].sort((a, b) => a.row - b.row);
  const success = result.success;
  const failed = allErrors.length;

  // Warnings (e.g. an unresolvable reporting manager) don't block the row —
  // it still imports and counts toward `success` — but are shown alongside
  // the real errors so nothing gets silently dropped with zero trace.
  const processingWarnings = result.warnings.map((w) => ({ row: originalRowNums[w.row - 1] ?? w.row, error: `⚠ ${w.warning}` }));
  const allNotices = [...allErrors, ...processingWarnings].sort((a, b) => a.row - b.row);

  await prisma.dataImport.update({
    where: { id: importId },
    data: {
      processedRows: success + failed,
      successRows: success,
      failedRows: failed,
      errors: allNotices.length > 0 ? JSON.parse(JSON.stringify(allNotices)) : undefined,
      status:
        failed === 0
          ? "ImportCompleted"
          : success === 0
            ? "ImportFailed"
            : "ImportPartial",
    },
  });

  await createAuditLog({
    orgId,
    userId,
    action: "Import",
    entityType: "Employee",
    metadata: { importId, success, failed, dryRun },
  });

  // No auto-invite. Imported employees are created only; they show up under
  // "Not yet invited" on the Users & Invitations screen, where an admin sends
  // the invitation manually.
}

/** Mark a stuck/failed import record failed (used as runBackground onError). */
export async function markBulkImportFailed(importId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : "Unknown error";
  await prisma.dataImport
    .update({
      where: { id: importId },
      data: { status: "ImportFailed", errors: [{ row: 0, error: msg }] },
    })
    .catch(() => {});
}
