import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processBulkEmployees } from "@/lib/services/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";
import { provisionCentralInvite } from "@/lib/services/invitation";
import { bulkEmployeeRowSchema } from "@/lib/validations/gap-fill";

const rowsSchema = z.array(bulkEmployeeRowSchema);

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

  const parsedRows = rowsSchema.parse(rows);

  const result = await processBulkEmployees(orgId, userId, parsedRows, dryRun, markActive);

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
    metadata: { importId, success: result.success, failed: result.failed, dryRun },
  });

  // Auto-invite freshly onboarded employees — provision each in central QuikIT
  // (central creates the login account AND sends the invite/set-password email)
  // + record a local Users & Invitations row. HRMS does not send the email.
  if (!dryRun && result.createdEmployees.length > 0) {
    let provisioned = 0;
    for (const emp of result.createdEmployees) {
      if (!emp.workEmail) continue;
      try {
        const r = await provisionCentralInvite({
          orgId,
          invitedBy: userId,
          email: emp.workEmail,
          firstName: emp.firstName,
          lastName: emp.lastName,
          employeeId: emp.id,
          roleIds: emp.roleId ? [emp.roleId] : [],
        });
        if (r.ok) provisioned++;
      } catch (e) {
        console.error("[bulk-import] auto-invite failed for", emp.workEmail, e);
      }
    }
    console.log(`[bulk-import] central invites provisioned: ${provisioned}/${result.createdEmployees.length}`);
  }
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
