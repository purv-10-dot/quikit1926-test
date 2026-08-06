import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { enqueueImportSafe } from "@/lib/queue/import-queue";
import { executeImportJob } from "@/lib/services/import/execute-import-job";

export const runtime = "nodejs";

const schema = z.object({
  fileName: z.string().optional(),
  csvText: z.string().min(1),
  sourceSystem: z.string().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
  /**
   * Optional CSV-header → Lead-field-key map from the mapping UI. When omitted,
   * the processor matches CSV headers to field keys/labels directly. Field keys
   * come from GET /api/settings/fields (standard + custom), so any field added
   * later is mappable with no code change.
   */
  columnMap: z.record(z.string()).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Accept import via either dedicated imports permission or lead create/import
    // (bulk import functionally creates leads).
    let permitted = false;
    for (const [module, action] of [
      ["imports", "import"],
      ["leads", "import"],
      ["leads", "create"],
    ] as const) {
      try {
        await assertModule(user, module, action);
        permitted = true;
        break;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status !== 403) throw err;
      }
    }
    if (!permitted) {
      return NextResponse.json({ error: "Forbidden: import on leads" }, { status: 403 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const job = await prisma.crmLeadImportJob.create({
      data: {
        tenantId: user.tenantId,
        entityType: "leads",
        sourceType: "csv",
        fileName: parsed.data.fileName,
        payloadCsvText: parsed.data.csvText,
        payloadJsonText: parsed.data.columnMap
          ? JSON.stringify({ columnMap: parsed.data.columnMap })
          : undefined,
        sourceSystem: parsed.data.sourceSystem,
        idempotencyKey: parsed.data.idempotencyKey,
        batchId: parsed.data.batchId,
        status: "queued",
        queuedAt: new Date(),
        createdByUserId: user.userId,
      },
    });
    // Enqueue to BullMQ is BEST-EFFORT and NON-BLOCKING. The inline
    // executeImportJob below is the source of truth for persistence, so it must
    // never depend on Redis being reachable. enqueueImportSafe returns null when
    // Redis is unset, unreachable, or slow (a configured-but-down Redis makes
    // q.add hang on the offline queue), so a dead daemon can't stall the import.
    // If a worker IS running it may also pick the job up, but executeImportJob's
    // atomic "queued → processing" claim makes any double-run a safe no-op.
    const bullJobId = await enqueueImportSafe({
      tenantId: user.tenantId,
      jobId: job.id,
      entityType: "leads",
      batchId: parsed.data.batchId ?? undefined,
    });
    if (bullJobId) {
      await prisma.crmLeadImportJob.update({ where: { id: job.id }, data: { bullJobId } });
    }

    const run = await executeImportJob({
      tenantId: user.tenantId,
      jobId: job.id,
      entityType: "leads",
      batchId: parsed.data.batchId ?? undefined,
    });

    if (run.outcome === "deferred" || run.outcome === "skipped") {
      return NextResponse.json({ jobId: job.id, bullJobId, status: "queued" }, { status: 202 });
    }

    return NextResponse.json(
      {
        jobId: job.id,
        bullJobId,
        status: run.status,
        totalRows: run.totalRows,
        importedCount: run.importedCount,
        createdCount: run.createdCount ?? 0,
        updatedCount: run.updatedCount ?? 0,
        rowErrors: run.rowErrors,
        lastError: run.lastError,
      },
      { status: run.status === "queued" ? 202 : 200 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
