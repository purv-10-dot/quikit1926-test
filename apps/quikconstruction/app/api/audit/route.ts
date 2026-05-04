import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("audit");

export const GET = withTenantAuth(async ({ orgId }, req) => {
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
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ success: true, data: list });
});
