import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("priority", "Priority");

const paramsSchema = z.object({
  owner: z.string().min(1),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.coerce.number().int().min(2020).max(2099),
});

/**
 * GET /api/priority/exported-lookup?owner=&quarter=&year=
 *
 * Priority counterpart of the KPI lookup. Returns only the columns the OPSP
 * "Export → Create Priorities" Previously-Exported / New tabs need, for every
 * priority this owner has in the quarter — a single indexed query, NO pagination.
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

  const items = await db.priority.findMany({
    where: { orgId, owner, quarter, year, deletedAt: null },
    select: {
      id: true,
      name: true,
      importedFromOpsp: true,
      startWeek: true,
      endWeek: true,
    },
  });

  return NextResponse.json({ success: true, data: { items } });
});
