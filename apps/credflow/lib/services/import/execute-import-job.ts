import type { Prisma } from "@quikit/database";
import type { QcfImportJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { enqueueImportSafe, type ImportJobData } from "@/lib/queue/import-queue";
import { backoffMs, isBlocked } from "@/lib/services/import/batch-coordinator";
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
      status: QcfImportJobStatus;
      totalRows: number;
      importedCount: number;
      createdCount?: number;
      updatedCount?: number;
      rowErrors: Array<{ row: number; error: string }>;
      lastError?: string;
    };

/**
 * Run one import job (same logic as the BullMQ worker).
 * Safe to call from the worker or inline from an API route after enqueue.
 */
export async function executeImportJob(data: ImportJobData): Promise<ImportJobRunResult> {
  const { tenantId, jobId, entityType } = data;
  const dbJob = await prisma.qcfLeadImportJob.findUnique({ where: { id: jobId } });
  if (!dbJob || dbJob.tenantId !== tenantId) {
    return { outcome: "skipped" };
  }

  if (await isBlocked(jobId)) {
    // Deferral re-queues for later. Non-blocking: if Redis is absent/down the job
    // simply stays "queued" for a later run instead of stalling on a dead queue.
    await enqueueImportSafe(data, { delayMs: 30_000 });
    return { outcome: "deferred" };
  }

  const claim = await prisma.qcfLeadImportJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "processing", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    const current = await prisma.qcfLeadImportJob.findUnique({ where: { id: jobId } });
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
    await prisma.qcfLeadImportJob.update({
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
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      rowErrors: result.rowErrors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const updated = await prisma.qcfLeadImportJob.findUnique({ where: { id: jobId } });
    const attempts = updated?.attempts ?? 1;

    if (attempts >= MAX_IMPORT_ATTEMPTS) {
      await prisma.qcfLeadImportJob.update({
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

    const delay = backoffMs(attempts);
    await prisma.qcfLeadImportJob.update({
      where: { id: jobId },
      data: { status: "queued", lastError: message, nextRetryAt: new Date(Date.now() + delay) },
    });
    // Retry is queue-driven. Non-blocking: without a reachable Redis the row just
    // stays "queued" with nextRetryAt set rather than stalling on a dead queue.
    await enqueueImportSafe(data, { delayMs: delay });

    return {
      outcome: "finished",
      status: "queued",
      totalRows: 0,
      importedCount: 0,
      rowErrors: [],
      lastError: message,
    };
  }
}
