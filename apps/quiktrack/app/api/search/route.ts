import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Cross-project quick-search endpoint backing the global search popover in
 * the header. Returns matching issues + projects scoped to whatever the
 * caller can see (admins → everything, members → their project memberships).
 *
 * Query params:
 *   q             — free-text search (matches issue key/title and project name/key)
 *   limit         — per-section cap (default 10, max 25)
 *   projectId     — optional scope filter
 *   assigneeId    — optional issue assignee filter
 *   reporterId    — optional issue reporter filter ("me" for the current user)
 *   statusCategory — BACKLOG | IN_PROGRESS | DONE
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(25, Math.max(1, limitRaw)) : 10;
  // Single-id (legacy) and multi-id (CSV) params for project/assignee.
  // The popover sends CSV; tests / external callers may still pass a single id.
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const projectIdsParam = url.searchParams.get("projectIds");
  const projectIds = projectIdsParam
    ? projectIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const assigneeId = url.searchParams.get("assigneeId") ?? undefined;
  const assigneeIdsParam = url.searchParams.get("assigneeIds");
  const assigneeIds = assigneeIdsParam
    ? assigneeIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const reporterParam = url.searchParams.get("reporterId") ?? undefined;
  const reporterId = reporterParam === "me" ? userId : reporterParam;
  // ISO date — only return issues with `updatedAt >= this`. Backs the
  // "Last updated" chip group (Today / Past 7 days / etc.).
  const updatedSinceParam = url.searchParams.get("updatedSince");
  const updatedSince = updatedSinceParam ? new Date(updatedSinceParam) : null;
  // Comma-separated category list (e.g. "BACKLOG,IN_PROGRESS"). Allows the
  // popover's checkbox group to send multiple selected categories in one call.
  const statusCategoryParam = url.searchParams.get("statusCategory");
  const statusCategories = statusCategoryParam
    ? statusCategoryParam
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is "BACKLOG" | "IN_PROGRESS" | "DONE" =>
          s === "BACKLOG" || s === "IN_PROGRESS" || s === "DONE",
        )
    : [];

  // Visibility scope.
  const isAdmin = await hasAdminAccess(userId, orgId);

  let allowedProjectIds: string[] | null = null;
  if (!isAdmin) {
    const memberships = await db.qtProjectMember.findMany({
      where: { userId, isDeleted: false },
      select: { projectId: true },
    });
    allowedProjectIds = memberships.map((m) => m.projectId);
    if (projectId && !allowedProjectIds.includes(projectId)) {
      return NextResponse.json({ success: true, data: { issues: [], projects: [] } });
    }
  }

  // Compose effective project filter:
  //   - explicit projectIds (CSV) take precedence
  //   - then single projectId
  //   - else fall back to the user's allowed memberships (or no scope for admin)
  const explicitProjectIds = projectIds.length > 0 ? projectIds : projectId ? [projectId] : null;
  const effectiveProjectIds = explicitProjectIds
    ? allowedProjectIds
      ? explicitProjectIds.filter((id) => allowedProjectIds!.includes(id))
      : explicitProjectIds
    : allowedProjectIds;
  const projectScope = effectiveProjectIds
    ? { projectId: { in: effectiveProjectIds } }
    : {};

  const issueWhere = {
    orgId: orgId,
    isDeleted: false,
    ...projectScope,
    ...(assigneeIds.length > 0
      ? { assigneeId: { in: assigneeIds } }
      : assigneeId
        ? { assigneeId }
        : {}),
    ...(reporterId ? { reporterId } : {}),
    ...(statusCategories.length > 0
      ? { status: { category: { in: statusCategories } } }
      : {}),
    ...(updatedSince && !Number.isNaN(updatedSince.getTime())
      ? { updatedAt: { gte: updatedSince } }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { key: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [issues, totalIssues, projects] = await Promise.all([
    db.qtIssue.findMany({
      where: issueWhere,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        projectId: true,
        statusId: true,
        updatedAt: true,
        status: { select: { id: true, name: true, category: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    db.qtIssue.count({ where: issueWhere }),
    db.qtProject.findMany({
      where: {
        orgId: orgId,
        isDeleted: false,
        ...(allowedProjectIds && !projectId
          ? { id: { in: allowedProjectIds } }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { projectKey: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        projectKey: true,
        icon: true,
        color: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { issues, projects, totalIssues },
  });
});
