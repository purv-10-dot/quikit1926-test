import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");

export const GET = withOrgAuth(async ({ orgId }) => {
  const rows = await db.kPI.findMany({
    where: { orgId },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  return NextResponse.json({ success: true, data: rows.map((r) => r.year) });
}, { fallbackErrorMessage: "Failed to fetch KPI years" });
