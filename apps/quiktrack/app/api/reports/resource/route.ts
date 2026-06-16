import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikTrackAppId, hasAdminAccess } from "@/lib/api/permissions";

/**
 * Resource utilisation report — used by /reports/resource.
 *
 *   GET /api/reports/resource?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=a,b,c
 *
 * Returns:
 *   {
 *     summary: { employees, employeesFilled, totalSpent, totalEstimated,
 *                totalOvershot, totalExpected },
 *     rows: [{
 *       userId, name, email,
 *       timesheetFilled: boolean,
 *       expectedHours, spentHours, estimatedHours, overshotHours,
 *       utilizationPct, overshotPct,
 *     }, ...]
 *   }
 *
 * Auth: admin-tier roles in the active org only.
 */
type SortKey =
  | "name"
  | "status"
  | "expected"
  | "spent"
  | "estimated"
  | "overshot"
  | "utilization"
  | "overshotPct";

const SORT_KEYS: ReadonlySet<SortKey> = new Set([
  "name",
  "status",
  "expected",
  "spent",
  "estimated",
  "overshot",
  "utilization",
  "overshotPct",
]);

function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  try {
    // Admin-tier gate: tenant admin (org owner/admin) OR QuikTrack app-admin.
    if (!(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    const userIdsParam = url.searchParams.get("userIds") || "";
    const filterUserIds = userIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Single PM / Project-Admin user filter (see /api/reports/role-users).
    const roleUserId = url.searchParams.get("roleUserId") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "15", 10) || 15));
    const sortBy = (url.searchParams.get("sortBy") ?? "name") as SortKey;
    const sortDir = (url.searchParams.get("sortDir") ?? "asc") === "desc" ? "desc" : "asc";

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { success: false, error: "from and to are required (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const from = new Date(`${fromStr}T00:00:00`);
    const toRaw = new Date(`${toStr}T00:00:00`);
    const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);

    // 1. Roster — every QuikTrack-enabled active OrgMember.
    const appId = await getQuikTrackAppId();
    if (!appId) {
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            employees: 0,
            employeesFilled: 0,
            totalSpent: 0,
            totalEstimated: 0,
            totalOvershot: 0,
            totalExpected: 0,
          },
          rows: [],
        },
      });
    }
    const access = await db.userAppAccess.findMany({
      where: { orgId, appId },
      select: { userId: true },
    });
    let userIds = access.map((a) => a.userId);
    if (filterUserIds.length > 0) {
      const set = new Set(filterUserIds);
      userIds = userIds.filter((id) => set.has(id));
    }
    if (roleUserId) {
      userIds = userIds.filter((id) => id === roleUserId);
    }

    const members = userIds.length
      ? await db.orgMember.findMany({
          where: { orgId, userId: { in: userIds }, status: "active" },
          select: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        })
      : [];

    // 2. Hours spent per user in window.
    const spentRows = userIds.length
      ? await db.qtTimesheetEntry.groupBy({
          by: ["userId"],
          where: {
            orgId,
            userId: { in: userIds },
            isDeleted: false,
            entryDate: { gte: from, lte: to },
          },
          _sum: { hours: true },
        })
      : [];
    const spentByUser = new Map<string, number>();
    for (const r of spentRows) spentByUser.set(r.userId, r._sum.hours ?? 0);

    // 3. Estimated hours per user — sum of `eta` across every open issue
    //    assigned to them (no date filter, no completed-status filter; the
    //    user-chosen semantic is "estimate of all issues").
    const estRows = userIds.length
      ? await db.qtIssue.groupBy({
          by: ["assigneeId"],
          where: { orgId, assigneeId: { in: userIds }, isDeleted: false },
          _sum: { eta: true },
        })
      : [];
    const estByUser = new Map<string, number>();
    for (const r of estRows) {
      if (r.assigneeId) estByUser.set(r.assigneeId, r._sum.eta ?? 0);
    }

    // 4. Expected hours — 8 × working days (Mon–Fri) across the window.
    const expectedHours = workingDaysBetween(from, to) * 8;

    const rows = members.map((m) => {
      const u = m.user;
      const spent = spentByUser.get(u.id) ?? 0;
      const estimated = estByUser.get(u.id) ?? 0;
      const overshot = Math.max(0, spent - estimated);
      const utilizationPct = expectedHours > 0 ? (spent / expectedHours) * 100 : 0;
      const overshotPct = estimated > 0 ? (overshot / estimated) * 100 : 0;
      return {
        userId: u.id,
        name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
        email: u.email,
        timesheetFilled: spent > 0,
        expectedHours,
        spentHours: spent,
        estimatedHours: estimated,
        overshotHours: overshot,
        utilizationPct,
        overshotPct,
      };
    });

    // Sort: validated key + direction, with a stable name tiebreaker so two
    // users with identical numeric values keep a deterministic order across
    // paginated requests.
    const key: SortKey = SORT_KEYS.has(sortBy) ? sortBy : "name";
    const dir = sortDir === "desc" ? -1 : 1;
    const pick = (r: typeof rows[number]): number | string => {
      switch (key) {
        case "name": return r.name.toLowerCase();
        case "status": return r.timesheetFilled ? 1 : 0;
        case "expected": return r.expectedHours;
        case "spent": return r.spentHours;
        case "estimated": return r.estimatedHours;
        case "overshot": return r.overshotHours;
        case "utilization": return r.utilizationPct;
        case "overshotPct": return r.overshotPct;
      }
    };
    rows.sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      const cmp = typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
      if (cmp !== 0) return cmp * dir;
      return a.name.localeCompare(b.name);
    });

    // Summary is computed across the FULL filtered set, not just the visible
    // page — totals must stay stable as the user paginates.
    const summary = {
      employees: rows.length,
      employeesFilled: rows.filter((r) => r.timesheetFilled).length,
      totalSpent: rows.reduce((s, r) => s + r.spentHours, 0),
      totalEstimated: rows.reduce((s, r) => s + r.estimatedHours, 0),
      totalOvershot: rows.reduce((s, r) => s + r.overshotHours, 0),
      totalExpected: rows.reduce((s, r) => s + r.expectedHours, 0),
    };

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const hasMore = start + pageRows.length < total;

    return NextResponse.json({
      success: true,
      data: {
        summary,
        rows: pageRows,
        page,
        pageSize,
        total,
        hasMore,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
