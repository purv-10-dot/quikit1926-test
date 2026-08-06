import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { activitySummaryRequestSchema } from "@/lib/validators/activity";
import { translateActivityFilterToPrismaWhere } from "@/lib/services/activities/filter-engine";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import { EXCLUDE_LEAD_INIT_EVENTS_WHERE } from "@/lib/services/leads/log-lead-system-activities";
import {
  summarizeByActivityType,
  type ActivityTypeSummaryRow,
} from "@/lib/services/activities/type-summary";

export const runtime = "nodejs";

/**
 * POST /api/activities/summary
 * Body: { filter: { matchMode, conditions[] } }
 * Returns: { success, data: { groups: [{ key, label, count }], total } }
 *
 * "Activity Type" counts for the CURRENTLY FILTERED activity set — the chip row
 * rendered between the filter chips and the table. The where-clause is built
 * from the same four parts as POST /api/activities/filter (orgId + filter + ACL
 * + lead-init exclusion); any divergence would make the summary disagree with
 * the table it sits above, so keep the two in sync.
 *
 * Labels are resolved from the org's CrmActivityType rows, so types added in
 * Settings → Activity Types appear here with no code change. Nothing is
 * hardcoded.
 *
 * Deliberately ignores page/pageSize: the summary describes the whole filtered
 * result set, not the visible page.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const parsed = activitySummaryRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid filter payload",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { filter } = parsed.data;
    const filterWhere = translateActivityFilterToPrismaWhere(filter);
    const acl = await buildActivityAclWhere(user);

    const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
    if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
    if (acl) baseAnd.push(acl);
    baseAnd.push(EXCLUDE_LEAD_INIT_EVENTS_WHERE);

    const where: Record<string, unknown> = { AND: baseAnd };

    // Counts and label config are independent reads — fetch together.
    // Types are NOT filtered to isActive: a deactivated type can still own
    // historical activities that the filtered set (and the table) includes,
    // and those chips must keep their real label rather than fall back to a
    // humanized code.
    const [grouped, configured] = await Promise.all([
      prisma.crmActivity.groupBy({
        by: ["type"],
        where,
        _count: { _all: true },
      }),
      prisma.crmActivityType.findMany({
        where: { orgId: user.orgId },
        select: { code: true, label: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
    ]);

    const groups: ActivityTypeSummaryRow[] = summarizeByActivityType(
      grouped.map((g) => ({ type: g.type, count: g._count._all })),
      configured,
    );
    const total = groups.reduce((sum, g) => sum + g.count, 0);

    return NextResponse.json({ success: true, data: { groups, total } });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to summarize activities";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/activities/summary POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
