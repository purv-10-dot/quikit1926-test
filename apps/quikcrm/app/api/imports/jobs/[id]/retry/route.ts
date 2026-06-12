import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { enqueueImport } from "@/lib/queue/import-queue";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const job = await prisma.crmLeadImportJob.findFirst({ where: { id, orgId: user.orgId } });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.crmLeadImportJob.update({
      where: { id },
      data: { status: "queued", attempts: 0, lastError: null, deadLetteredAt: null, queuedAt: new Date() },
    });
    const bullJobId = await enqueueImport({
      orgId: user.orgId,
      jobId: job.id,
      entityType: job.entityType,
      batchId: job.batchId ?? undefined,
    });
    return NextResponse.json({ ok: true, jobId: job.id, bullJobId });
  } catch (e) {
    return errorResponse(e);
  }
}
