import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { parseFilters } from "@/lib/services/dashboard/filters";
import { prospectScopeWhere, canViewAllProspects } from "@/lib/auth/prospect-acl";
import { orderProspectStages } from "@/lib/services/prospects/funnel-stages";
import type { FunnelStep } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/prospect-funnel
 *
 * Counts of CrmProspect rows per status, for the Dashboard's Prospect Funnel
 * widget. Every count comes from a groupBy over the live table — nothing here is
 * static.
 *
 * Visibility reuses lib/auth/prospect-acl (the SAME clause the Settings →
 * Prospects list uses), so this route can never widen what a user already sees:
 *   Administrator → org-wide, and may narrow to one user via ?ownerId=<userId>
 *   everyone else → own prospects only (savedById = self); an ?ownerId naming
 *                   somebody else is intersected to nothing rather than honored.
 *
 * `ownerId` maps to CrmProspect.savedById — prospects have no `ownerId` column
 * (they are pre-pipeline captures), so the dashboard-wide Owner dropdown is
 * applied to the person who saved the prospect.
 *
 * Date filtering is opt-in via ?applyRange=1, which the dashboard card DOES send
 * (see prospect-funnel-chart.tsx) so this funnel windows together with every
 * other widget. Callers wanting the full current backlog — a snapshot including
 * prospects saved earlier that are still at "New" — simply omit the flag.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const filters = parseFilters(req, user);
    const applyRange = new URL(req.url).searchParams.get("applyRange") === "1";

    // Base ACL clause — org-scoped, and savedById=self for non-admins.
    const where: Prisma.CrmProspectWhereInput = { ...prospectScopeWhere(user) };

    // Owner dropdown narrows WITHIN the allowed scope, never widens it. For a
    // non-admin the clause above already pins savedById to self, so a foreign id
    // must resolve to no rows.
    if (filters.resolvedOwnerId) {
      where.savedById = canViewAllProspects(user)
        ? filters.resolvedOwnerId
        : filters.resolvedOwnerId === user.userId
          ? user.userId
          : "__none__";
    }

    if (applyRange) {
      where.createdAt = { gte: filters.range.from, lte: filters.range.to };
    }

    const grouped = await prisma.crmProspect.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    for (const row of grouped) {
      // Rows written before the default landed can carry null/"" — bucket them
      // as "New", which is what the schema default means.
      const key = row.status?.trim() ? row.status : "New";
      counts.set(key, (counts.get(key) ?? 0) + row._count._all);
    }

    const stages = orderProspectStages(counts.keys());
    const total = [...counts.values()].reduce((a, b) => a + b, 0);

    // Absolute (non-cumulative) counts: a prospect has exactly one status, and
    // "how many are sitting at each stage right now" is the question this widget
    // answers. Percentages are share-of-total so the bars stay comparable.
    const steps: FunnelStep[] = stages.map((stage) => {
      const count = counts.get(stage) ?? 0;
      return {
        stage,
        count,
        pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        steps,
        total,
        scope: canViewAllProspects(user) ? "org" : "own",
        canFilterByUser: canViewAllProspects(user),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
