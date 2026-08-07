import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { enqueueImport } from "@/lib/queue/import-queue";
import { requireRedisOr503 } from "@/lib/queue/guard";

export const runtime = "nodejs";

const schema = z.object({
  fileName: z.string().optional(),
  jsonText: z.string().min(1),
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
    await assertModule(user, "activities", "import");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const job = await prisma.qcfLeadImportJob.create({
      data: {
        tenantId: user.tenantId,
        entityType: "activities",
        sourceType: "json",
        fileName: parsed.data.fileName,
        payloadJsonText: parsed.data.jsonText,
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
      entityType: "activities",
      batchId: parsed.data.batchId ?? undefined,
    });
    await prisma.qcfLeadImportJob.update({ where: { id: job.id }, data: { bullJobId } });
    return NextResponse.json({ jobId: job.id, bullJobId, status: "queued" }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
