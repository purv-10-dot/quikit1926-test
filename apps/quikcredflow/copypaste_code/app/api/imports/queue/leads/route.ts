import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { enqueueImport } from "@/lib/queue/import-queue";
import { requireRedisOr503 } from "@/lib/queue/guard";
import { executeImportJob } from "@/lib/services/import/execute-import-job";

export const runtime = "nodejs";

const schema = z.object({
  fileName: z.string().optional(),
  csvText: z.string().min(1),
  sourceSystem: z.string().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const guard = requireRedisOr503();
    if (guard) return guard;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "import");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const job = await prisma.crmLeadImportJob.create({
      data: {
        tenantId: user.tenantId,
        entityType: "leads",
        sourceType: "csv",
        fileName: parsed.data.fileName,
        payloadCsvText: parsed.data.csvText,
        sourceSystem: parsed.data.sourceSystem,
        idempotencyKey: parsed.data.idempotencyKey,
        batchId: parsed.data.batchId,
        status: "queued",
        queuedAt: new Date(),
        createdByUserId: user.userId,
      },
    });
    const bullJobId = await enqueueImport({
      tenantId: user.tenantId,
      jobId: job.id,
      entityType: "leads",
      batchId: parsed.data.batchId ?? undefined,
    });
    await prisma.crmLeadImportJob.update({ where: { id: job.id }, data: { bullJobId } });

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
        rowErrors: run.rowErrors,
        lastError: run.lastError,
      },
      { status: run.status === "queued" ? 202 : 200 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
