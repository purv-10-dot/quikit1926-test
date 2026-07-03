import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("AuditLog");

export const GET = auth.view(async ({ orgId }, req) => {
  const { searchParams } = new URL(req.url);
  const moduleParam = searchParams.get("module");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const logs = await db.astAuditLog.findMany({
    where: {
      orgId,
      ...(moduleParam && moduleParam !== "All" ? { module: moduleParam } : {}),
      ...(search
        ? {
            OR: [
              { entityName: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
              { details: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
      ...(to ? { createdAt: { lte: new Date(to + "T23:59:59Z") } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ success: true, data: logs });
});
