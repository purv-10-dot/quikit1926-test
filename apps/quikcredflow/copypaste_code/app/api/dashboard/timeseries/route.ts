/**
 * Per-day buckets for the configured metric inside the selected range.
 * Currently the only metric is `activities`; the shape is generic so adding
 * more (calls, leads-created) is a matter of one more case.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { parseFilters } from "@/lib/services/dashboard/filters";
import { buildDayBuckets } from "@/lib/services/dashboard/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = "activities" | "calls" | "leads-created";

function readMetric(req: NextRequest): Metric {
  const m = new URL(req.url).searchParams.get("metric");
  if (m === "calls" || m === "leads-created") return m;
  return "activities";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const filters = parseFilters(req, user);
    const metric = readMetric(req);
    const buckets = buildDayBuckets(filters.range);

    const counts = await Promise.all(
      buckets.map((b) => {
        const tenantId = user.tenantId;
        const ownerId = filters.resolvedOwnerId;
        if (metric === "calls") {
          return prisma.crmCallLog.count({
            where: {
              tenantId,
              createdAt: { gte: b.start, lte: b.end },
              ...(ownerId ? { agentUserId: ownerId } : {}),
            },
          });
        }
        if (metric === "leads-created") {
          return prisma.crmLead.count({
            where: {
              tenantId,
              createdAt: { gte: b.start, lte: b.end },
              ...(ownerId ? { ownerId } : {}),
            },
          });
        }
        return prisma.crmActivity.count({
          where: {
            tenantId,
            occurredAt: { gte: b.start, lte: b.end },
            ...(ownerId ? { ownerId } : {}),
          },
        });
      }),
    );

    return NextResponse.json({
      metric,
      points: buckets.map((b, i) => ({ label: b.label, iso: b.iso, count: counts[i] ?? 0 })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
