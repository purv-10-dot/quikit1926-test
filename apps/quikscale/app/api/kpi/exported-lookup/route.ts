import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("kpi", "KPI");

const paramsSchema = z.object({
  owner: z.string().min(1),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.coerce.number().int().min(2020).max(2099),
});

/**
 * GET /api/kpi/exported-lookup?owner=&quarter=&year=
 *
 * Lightweight, DB-level lookup powering the OPSP "Export → Create KPIs"
 * Previously-Exported / New tabs. Returns ONLY the columns categorization
 * needs, for every individual KPI this owner has in the quarter — a single
 * indexed query with NO pagination cap (unlike the heavy list endpoint, which
 * caps pageSize at 100 and decorates audit/weekly data we don't need here).
 */
export const GET = auth.view(async ({ orgId }, req) => {
  const sp = req.nextUrl.searchParams;
  const parsed = paramsSchema.safeParse({
    owner: sp.get("owner") ?? "",
    quarter: sp.get("quarter") ?? "",
    year: sp.get("year") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { owner, quarter, year } = parsed.data;

  const items = await db.kPI.findMany({
    where: {
      orgId,
      owner,
      quarter,
      year,
      kpiLevel: "individual",
      deletedAt: null,
      parentKPIId: null,
    },
    select: {
      id: true,
      name: true,
      target: true,
      importedFromOpsp: true,
      measurementUnit: true,
      divisionType: true,
      frequency: true,
    },
  });

  return NextResponse.json({ success: true, data: { items } });
});
