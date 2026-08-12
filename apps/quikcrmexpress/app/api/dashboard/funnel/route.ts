import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { parseFilters, applyOwnerRestriction, tenantOwnerWhere } from "@/lib/services/dashboard/filters";
import { getDashboardConfig } from "@/lib/services/workspace/dashboard-config";
import type { FunnelStep } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const filters = await applyOwnerRestriction(parseFilters(req, user), user);
    const cfg = await getDashboardConfig(user.orgId);

    const where = {
      ...tenantOwnerWhere(user, filters.resolvedOwnerId),
      // QceLead has `deletedAt`. The package middleware does not yet inject
      // this clause; filter explicitly until that registration lands.
      deletedAt: null,
      createdAt: { gte: filters.range.from, lte: filters.range.to },
    };

    const grouped = await prisma.qceLead.groupBy({
      by: ["stage"],
      where,
      _count: true,
    });

    const counts = new Map<string, number>();
    for (const row of grouped) {
      const c = typeof row._count === "number" ? row._count : 0;
      counts.set(row.stage || "—", c);
    }

    // Cumulative funnel — leads at stage N include those who are at stage >= N
    // in the configured funnel order. Top-of-funnel = 100%.
    const orderIndex = new Map<string, number>(cfg.funnelStages.map((s, i) => [s, i]));
    const cumulative = cfg.funnelStages.map((stage, i) => {
      let total = 0;
      for (const [s, c] of counts) {
        const idx = orderIndex.get(s);
        if (idx !== undefined && idx >= i) total += c;
      }
      return { stage, count: total };
    });

    const top = cumulative[0]?.count ?? 0;
    const steps: FunnelStep[] = cumulative.map((s) => ({
      stage: s.stage,
      count: s.count,
      pct: top > 0 ? Math.round((s.count / top) * 1000) / 10 : 0,
    }));

    return NextResponse.json({ success: true, data: { steps } });
  } catch (e) {
    return errorResponse(e);
  }
}
