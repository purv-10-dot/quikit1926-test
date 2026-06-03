import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.crmLeadImportJob.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fileName: true,
        entityType: true,
        status: true,
        totalRows: true,
        importedCount: true,
        attempts: true,
        queuedAt: true,
        completedAt: true,
        deadLetteredAt: true,
        lastError: true,
      },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
