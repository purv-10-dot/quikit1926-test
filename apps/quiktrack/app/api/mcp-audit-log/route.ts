import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * QUIKTR-121 — MCP action audit log. Returns QtMcpActionLog rows (one per
 * mutating MCP tool call) the caller is allowed to see.
 *
 * Two access modes:
 *  - Single-entity query (entityId + projectId both given, e.g. the
 *    per-issue "MCP Log" activity tab): gated by ordinary project
 *    membership, same as the existing Comments/History tabs — any project
 *    member can see an entity's own action history, not just admins.
 *  - Broad query (no entityId, e.g. the settings Audit Log page): gated by
 *    the same two-tier admin/Space-Admin scope /api/reports/tasks uses —
 *    this is oversight data, not per-user self-service data.
 *
 * Query params:
 *   projectId          – scope to one project (cuid or key)
 *   tool                – filter by MCP tool name
 *   entityType          – filter by entity type (issue/sprint/comment/...)
 *   entityId            – filter to one entity (used by the per-issue tab)
 *   action              – filter by CREATE/UPDATE/MOVE/DELETE
 *   actorId             – filter by the acting user's id
 *   from / to           – createdAt range (ISO)
 *   page / pageSize     – offset pagination
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const projectIdOrKey = url.searchParams.get("projectId");
  const tool = url.searchParams.get("tool");
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const action = url.searchParams.get("action");
  const actorId = url.searchParams.get("actorId");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;

  let projectId: string | null = null;
  if (projectIdOrKey) {
    const proj = await db.qtProject.findFirst({
      where: { orgId, isDeleted: false, OR: [{ id: projectIdOrKey }, { projectKey: projectIdOrKey }] },
      select: { id: true },
    });
    if (!proj) return NextResponse.json({ success: true, data: emptyPage() });
    projectId = proj.id;
  }

  let projectIds: string[] | null = null;
  if (entityId && projectId) {
    const access = await loadProjectAccess(orgId, userId, projectId);
    if (!access) return NextResponse.json({ success: true, data: emptyPage() });
  } else {
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin) {
      projectIds = await spaceAdminProjectIds(userId, orgId);
      if (projectIds.length === 0 || (projectId && !projectIds.includes(projectId))) {
        return NextResponse.json({ success: true, data: emptyPage() });
      }
    }
  }

  const where = {
    orgId,
    ...(projectId ? { projectId } : projectIds ? { projectId: { in: projectIds } } : {}),
    ...(tool ? { tool } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(action ? { action } : {}),
    ...(actorId ? { userId: actorId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
  };

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 20)));

  // Facets scoped to project access + date window, independent of the
  // tool/entityType/action/actor filters, so dropdowns list every option in
  // the accessible dataset rather than just what's on the current page.
  const facetWhere = {
    orgId,
    ...(projectIds ? { projectId: { in: projectIds } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };

  const [total, entries, toolGroups, entityTypeGroups, actionGroups] = await Promise.all([
    db.qtMcpActionLog.count({ where }),
    db.qtMcpActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.qtMcpActionLog.groupBy({ by: ["tool"], where: facetWhere }),
    db.qtMcpActionLog.groupBy({ by: ["entityType"], where: facetWhere }),
    db.qtMcpActionLog.groupBy({ by: ["action"], where: facetWhere }),
  ]);

  const userIds = Array.from(new Set(entries.map((e) => e.userId)));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const shaped = entries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    actor: userById.get(e.userId) ?? null,
    actorType: e.actorType,
    projectId: e.projectId,
    tool: e.tool,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    entityKey: e.entityKey,
    payload: e.payload,
    before: e.before,
    after: e.after,
    result: e.result,
    errorMessage: e.errorMessage,
  }));

  return NextResponse.json({
    success: true,
    data: {
      entries: shaped,
      facets: {
        tools: toolGroups.map((g) => g.tool).sort(),
        entityTypes: entityTypeGroups.map((g) => g.entityType).sort(),
        actions: actionGroups.map((g) => g.action).sort(),
      },
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

function emptyPage() {
  return {
    entries: [],
    facets: { tools: [], entityTypes: [], actions: [] },
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  };
}
