import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  activityFilterRequestSchema,
  SORTABLE_ACTIVITY_KEYS,
} from "@/lib/validators/activity";
import { translateActivityFilterToPrismaWhere } from "@/lib/services/activities/filter-engine";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import { EXCLUDE_LEAD_INIT_EVENTS_WHERE } from "@/lib/services/leads/log-lead-system-activities";
import { toListRows } from "@/lib/services/activities/to-list-row";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";

export const runtime = "nodejs";

/**
 * POST /api/activities/filter
 * Body: { filter: { matchMode, conditions[] }, page, pageSize, sortBy, sortDir }
 * Returns: { success, data: { items, total, page, pageSize } }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const parsed = activityFilterRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid filter payload",
          fieldErrors: parsed.error.flatten().fieldErrors,
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const { filter, page, pageSize, sortBy, sortDir } = parsed.data;
    const filterWhere = translateActivityFilterToPrismaWhere(filter);
    const acl = await buildActivityAclWhere(user);

    const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
    if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
    if (acl) baseAnd.push(acl);
    // Hide the internal lead-creation init events (Source/Owner/Stage/Status)
    // from the global Activities list — only the single "Lead Created" entry
    // shows. Rows remain in the DB for audit/reporting.
    baseAnd.push(EXCLUDE_LEAD_INIT_EVENTS_WHERE);

    const where: Record<string, unknown> = { AND: baseAnd };

    const safeSortBy = SORTABLE_ACTIVITY_KEYS.has(sortBy) ? sortBy : "occurredAt";
    const orderBy =
      safeSortBy === "id"
        ? [{ id: sortDir }]
        : [{ [safeSortBy]: sortDir }, { id: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.crmActivity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      prisma.crmActivity.count({ where }),
    ]);

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const items = await toListRows(user.orgId, rows, tz);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      success: true,
      data: { items, total, page, pageSize, totalPages },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to filter activities";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/activities/filter POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
