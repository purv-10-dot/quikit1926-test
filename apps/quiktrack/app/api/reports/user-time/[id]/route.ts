import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Time summary for a single user — used by the Attendance matrix drawer.
 *
 *   GET /api/reports/user-time/[id]?from=&to=&projectId=&search=&page=&pageSize=
 *
 * Returns the user header, every timesheet entry across the period (with
 * project + issue references), per-project breakdown, and a grand-total.
 *
 * Auth: any org member can query their own summary; tenant admins can query
 * anyone in the same org.
 */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  try {
    const url = new URL(req.url);
    const targetUserId = params.id;
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    const projectId = url.searchParams.get("projectId") || undefined;
    const search = (url.searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "10", 10) || 10));

    // Permission gate: self OR admin-tier in same org. `hasAdminAccess` =
    // tenant admin (org owner/admin) OR QuikTrack app-admin.
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin && targetUserId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    // Resolve display info. Prefer OrgMember (gives us the canonical name
    // for the active org), but fall back to auth.User directly so users
    // without an active OrgMember row still surface their logged time —
    // the grid endpoint behaves the same way, otherwise the matrix and
    // drawer disagree.
    const orgMember = await db.orgMember.findFirst({
      where: { userId: targetUserId, orgId, status: "active" },
      select: { userId: true, user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } } },
    });
    let userInfo = orgMember?.user ?? null;
    if (!userInfo) {
      userInfo = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
    }
    if (!userInfo) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // The matrix sends inclusive YYYY-MM-DD strings; bump `to` to end of day
    // so entries on the last day are included.
    const from = fromStr ? new Date(`${fromStr}T00:00:00`) : new Date(0);
    const toRaw = toStr ? new Date(`${toStr}T00:00:00`) : new Date();
    const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);

    const where = {
      orgId,
      userId: targetUserId,
      isDeleted: false,
      entryDate: { gte: from, lte: to },
      ...(projectId ? { projectId } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: "insensitive" as const } },
              { issue: { title: { contains: search, mode: "insensitive" as const } } },
              { issue: { key: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const total = await db.qtTimesheetEntry.count({ where });

    const entries = await db.qtTimesheetEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        entryDate: true,
        hours: true,
        description: true,
        projectId: true,
        issue: { select: { id: true, key: true, title: true } },
      },
    });

    // Project lookup for the entries page + per-project breakdown across the
    // FULL filtered range (not just the current page) so the totals are
    // accurate.
    const allByProject = await db.qtTimesheetEntry.groupBy({
      by: ["projectId"],
      where,
      _sum: { hours: true },
    });
    const projectIds = Array.from(new Set([
      ...entries.map((e) => e.projectId),
      ...allByProject.map((b) => b.projectId),
    ]));
    const projects = projectIds.length
      ? await db.qtProject.findMany({
          where: { id: { in: projectIds }, orgId },
          select: { id: true, name: true, projectKey: true, color: true },
        })
      : [];
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // For the project filter dropdown — projects the target user has logged
    // ANY time in (within the date range, ignoring projectId filter so a
    // selected filter doesn't shrink the dropdown).
    const filterProjectsAgg = await db.qtTimesheetEntry.groupBy({
      by: ["projectId"],
      where: { orgId, userId: targetUserId, isDeleted: false, entryDate: { gte: from, lte: to } },
      _sum: { hours: true },
    });
    const filterProjectIds = filterProjectsAgg.map((p) => p.projectId);
    const filterProjects = filterProjectIds.length
      ? await db.qtProject.findMany({
          where: { id: { in: filterProjectIds }, orgId },
          select: { id: true, name: true, projectKey: true },
        })
      : [];

    const totalHours = allByProject.reduce((s, b) => s + (b._sum.hours ?? 0), 0);

    const data = {
      user: {
        id: userInfo.id,
        name: `${userInfo.firstName ?? ""} ${userInfo.lastName ?? ""}`.trim() || userInfo.email,
        email: userInfo.email,
        avatar: userInfo.avatar,
      },
      entries: entries.map((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        hours: e.hours,
        description: e.description,
        project: projectMap.get(e.projectId)
          ? {
              id: e.projectId,
              key: projectMap.get(e.projectId)!.projectKey,
              name: projectMap.get(e.projectId)!.name,
              color: projectMap.get(e.projectId)!.color,
            }
          : { id: e.projectId, key: "", name: "—", color: null },
        issue: e.issue,
      })),
      byProject: allByProject
        .map((b) => {
          const p = projectMap.get(b.projectId);
          return {
            project: {
              id: b.projectId,
              key: p?.projectKey ?? "",
              name: p?.name ?? "—",
              color: p?.color ?? null,
            },
            hours: b._sum.hours ?? 0,
          };
        })
        .sort((a, b) => b.hours - a.hours),
      filterProjects: filterProjects
        .map((p) => ({ id: p.id, key: p.projectKey, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      totalHours,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
