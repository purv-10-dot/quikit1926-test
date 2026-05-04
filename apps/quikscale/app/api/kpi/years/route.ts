import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");

export const GET = withTenantAuth(async ({ orgId }) => {
  const rows = await db.kPI.findMany({
    where: { orgId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  return NextResponse.json({ success: true, data: rows.map((r) => r.year) });
}, { fallbackErrorMessage: "Failed to fetch KPI years" });
