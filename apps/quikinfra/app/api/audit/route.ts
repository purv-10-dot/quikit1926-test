import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("audit");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const sp = req.nextUrl.searchParams;
  const entityType = sp.get("entityType") || undefined;
  const entityId = sp.get("entityId") || undefined;
  const userId = sp.get("userId") || undefined;
  const where = {
    orgId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(userId ? { userId } : {}),
  };

  // Paginated when a ?page is supplied; else the legacy capped-recent fetch.
  const pageRaw = parseInt(sp.get("page") ?? "", 10);
  if (Number.isFinite(pageRaw) && pageRaw >= 1) {
    const page = pageRaw;
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10)));
    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      db.cnAuditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: pageSize,
        skip,
      }),
      db.cnAuditLog.count({ where }),
    ]);
    return NextResponse.json({
      success: true,
      data: list,
      total,
      page,
      pageSize,
      hasMore: skip + list.length < total,
    });
  }

  const limit = Math.min(500, parseInt(sp.get("limit") ?? "100", 10));
  const list = await db.cnAuditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  return NextResponse.json({ success: true, data: list });
});
