import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const job = await prisma.qcfLeadImportJob.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        totalRows: job.totalRows,
        importedCount: job.importedCount,
        attempts: job.attempts,
        rowErrors: job.rowErrors,
        lastError: job.lastError,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
