import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("audit");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const entityType = req.nextUrl.searchParams.get("entityType") || undefined;
  const entityId = req.nextUrl.searchParams.get("entityId") || undefined;
  const userId = req.nextUrl.searchParams.get("userId") || undefined;
  const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10));
  const list = await db.cnAuditLog.findMany({
    where: {
      orgId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  return NextResponse.json({ success: true, data: list });
});
