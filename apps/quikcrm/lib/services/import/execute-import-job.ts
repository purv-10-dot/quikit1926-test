import type { Prisma } from "@quikit/database";
import type { CrmImportJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type ImportJobData } from "@/lib/queue/import-queue";
import { isBlocked } from "@/lib/services/import/batch-coordinator";
import {
  processActivitiesImport,
  processLeadsImport,
  processSlaImport,
  processWorkflowsImport,
} from "@/lib/services/import/processors";

const MAX_IMPORT_ATTEMPTS = Math.max(1, Number(process.env.IMPORT_MAX_ATTEMPTS ?? "3"));

export type ImportJobRunResult =
  | { outcome: "deferred" }
  | { outcome: "skipped" }
  | {
      outcome: "finished";
      status: CrmImportJobStatus;
      totalRows: number;
      importedCount: number;
      rowErrors: Array<{ row: number; error: string }>;
      lastError?: string;
    };

/**
 * Run one import job (same logic as the BullMQ worker).
 * Safe to call from the worker or inline from an API route after enqueue.
 */
export async function executeImportJob(data: ImportJobData): Promise<ImportJobRunResult> {
  const { orgId, jobId, entityType } = data;
  const dbJob = await prisma.crmLeadImportJob.findUnique({ where: { id: jobId } });
  if (!dbJob || dbJob.orgId !== orgId) {
    return { outcome: "skipped" };
  }

  if (await isBlocked(jobId)) {
    // Deferral relied on BullMQ re-enqueue. The queue backend has been removed,
    // so there is nothing to defer onto — skip rather than strand the job in a
    // "queued" state that nothing will ever pick up.
    return { outcome: "skipped" };
  }

  const claim = await prisma.crmLeadImportJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "processing", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    const current = await prisma.crmLeadImportJob.findUnique({ where: { id: jobId } });
    if (current && current.status !== "queued") {
      return {
        outcome: "finished",
        status: current.status,
        totalRows: current.totalRows,
        importedCount: current.importedCount,
        rowErrors: (current.rowErrors as Array<{ row: number; error: string }> | null) ?? [],
        lastError: current.lastError ?? undefined,
      };
    }
    return { outcome: "skipped" };
  }

  try {
    let result;
    switch (entityType) {
      case "leads":
        result = await processLeadsImport(dbJob);
        break;
      case "activities":
        result = await processActivitiesImport(dbJob);
        break;
      case "workflows":
        result = await processWorkflowsImport(dbJob);
        break;
      case "sla":
        result = await processSlaImport(dbJob);
        break;
      default: {
        const unknown: never = entityType;
        throw new Error(`Unknown entity type: ${unknown}`);
      }
    }

    const finalStatus = result.rowErrors.length === 0 ? "completed" : "completed_with_errors";
    await prisma.crmLeadImportJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        totalRows: result.totalRows,
        importedCount: result.importedCount,
        rowErrors: result.rowErrors as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      outcome: "finished",
      status: finalStatus,
      totalRows: result.totalRows,
      importedCount: result.importedCount,
      rowErrors: result.rowErrors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const updated = await prisma.crmLeadImportJob.findUnique({ where: { id: jobId } });
    const attempts = updated?.attempts ?? 1;

    if (attempts >= MAX_IMPORT_ATTEMPTS) {
      await prisma.crmLeadImportJob.update({
        where: { id: jobId },
        data: { status: "dead_letter", deadLetteredAt: new Date(), lastError: message },
      });
      return {
        outcome: "finished",
        status: "dead_letter",
        totalRows: updated?.totalRows ?? 0,
        importedCount: updated?.importedCount ?? 0,
        rowErrors: [],
        lastError: message,
      };
    }

    // Retry relied on BullMQ scheduling a delayed job. The queue backend has
    // been removed, so dead-letter the job instead of leaving it "queued"
    // forever with nothing to pick it up.
    await prisma.crmLeadImportJob.update({
      where: { id: jobId },
      data: { status: "dead_letter", deadLetteredAt: new Date(), lastError: message },
    });

    return {
      outcome: "finished",
      status: "dead_letter",
      totalRows: updated?.totalRows ?? 0,
      importedCount: updated?.importedCount ?? 0,
      rowErrors: [],
      lastError: message,
    };
  }
}
