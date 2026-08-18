import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { parseCustomFilters, customFiltersToWhere } from "@/lib/customFields/filterQuery";
import { parse as parseTql } from "@/lib/tql/parser";
import { translate as translateTql } from "@/lib/tql/translator";
import { TqlParseError } from "@/lib/tql/errors";

/**
 * GET /api/filters/:id?search=&limit=&offset=
 *
 * Returns work items matching one of the platform's default filters.
 * Filter ids are slugs (kebab-case) and map to a fixed Prisma where/orderBy
 * pair. Unknown ids → 404.
 *
 * NOTE: "viewed-recently" has no view-tracking source yet; it falls back to
 * `updatedAt desc` and is flagged via `meta.fallback` so the UI can warn.
 *
 * Admin-only TQL mode: `?tql=<query>` bypasses the slug/toolbar where-building
 * below entirely (id must be "all") and instead compiles the query via
 * lib/tql. Non-admins get a 403 before any parsing happens.
 */

export type FilterId =
  | "search"
  | "my-open"
  | "reported-by-me"
  | "all"
  | "open"
  | "done"
  | "viewed-recently"
  | "created-recently"
  | "resolved-recently"
  | "updated-recently";

const FILTER_TITLES: Record<FilterId, string> = {
  search: "All work",
  "my-open": "My open work items",
  "reported-by-me": "Reported by me",
  all: "All work items",
  open: "Open work items",
  done: "Done work items",
  "viewed-recently": "Viewed recently",
  "created-recently": "Created recently",
  "resolved-recently": "Resolved recently",
  "updated-recently": "Updated recently",
};

const ALL_IDS = Object.keys(FILTER_TITLES) as FilterId[];

function isFilterId(s: string): s is FilterId {
  return (ALL_IDS as string[]).includes(s);
}

export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const id = params.id;
  if (!isFilterId(id)) {
    return NextResponse.json({ success: false, error: "Unknown filter" }, { status: 404 });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const tqlRaw = url.searchParams.get("tql")?.trim();
  let tqlOrderBy: Prisma.QtIssueOrderByWithRelationInput[] | null = null;

  if (tqlRaw) {
    if (!(await hasAdminAccess(userId, orgId))) {
      return NextResponse.json({ success: false, error: "TQL search is admin-only" }, { status: 403 });
    }
    if (id !== "all") {
      return NextResponse.json(
        { success: false, error: 'TQL search requires the "all" filter' },
        { status: 400 },
      );
    }
  }

  // Toolbar overrides — when set, they replace the slug's implicit filter
  // for that field. Slug-derived filters still apply for fields the toolbar
  // doesn't touch. Skipped entirely in TQL mode (see below).
  const oProjectId = url.searchParams.get("projectId")?.trim() || undefined;
  const oAssignee = url.searchParams.get("assignee")?.trim() || undefined;
  const oReporter = url.searchParams.get("reporter")?.trim() || undefined;
  const oType = (url.searchParams.get("type") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const oStatusCat = (url.searchParams.get("statusCategory") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const oResolution = url.searchParams.get("resolution")?.trim() || undefined;

  const where: Prisma.QtIssueWhereInput = { orgId, isDeleted: false };
  let orderBy: Prisma.QtIssueOrderByWithRelationInput = { updatedAt: "desc" };
  let fallback: string | undefined;
  let customFilterWhere: Prisma.QtIssueWhereInput[] = [];

  if (tqlRaw) {
    // TQL mode replaces the slug/toolbar/search/custom-filter where-building
    // below entirely — the translated where/orderBy are the only source of
    // truth for this request (orgId/isDeleted above are still applied).
    try {
      // cf[...] refs may be an id or a name — org-wide (TQL isn't
      // project-scoped), so every active custom field in the org is
      // fetched once and looked up by either key. Cheap: this is a small,
      // admin-configured table, not per-issue data.
      const customFields = await db.qtCustomField.findMany({
        where: { orgId, status: "active", isDeleted: false },
        select: { id: true, name: true, type: true },
      });
      const byId = new Map(customFields.map((f) => [f.id, f] as const));
      const byName = new Map(customFields.map((f) => [f.name.toLowerCase(), f] as const));
      const resolveCustomField = (ref: string) => {
        const hit = byId.get(ref) ?? byName.get(ref.toLowerCase());
        return hit ? { id: hit.id, type: hit.type } : undefined;
      };

      const query = parseTql(tqlRaw);
      const { where: tqlWhere, orderBy: builtOrderBy } = translateTql(query, { userId, resolveCustomField });
      Object.assign(where, tqlWhere);
      if (builtOrderBy.length > 0) {
        tqlOrderBy = builtOrderBy;
        orderBy = builtOrderBy[0]!;
      }
    } catch (error: unknown) {
      if (error instanceof TqlParseError) {
        return NextResponse.json(
          { success: false, error: error.message, position: error.position },
          { status: 400 },
        );
      }
      throw error;
    }
  } else {
    switch (id) {
      case "my-open":
        where.assigneeId = userId;
        where.status = { category: { not: "DONE" } };
        break;
      case "reported-by-me":
        where.OR = [{ reporterId: userId }, { createdBy: userId }];
        break;
      case "all":
        break;
      case "open":
        where.status = { category: { not: "DONE" } };
        break;
      case "done":
        where.status = { category: "DONE" };
        break;
      case "viewed-recently":
        // No view-tracking source exists yet — fall back to most-recently-updated.
        orderBy = { updatedAt: "desc" };
        fallback = "Showing most-recently-updated. View history isn't tracked yet.";
        break;
      case "created-recently":
        orderBy = { createdAt: "desc" };
        break;
      case "resolved-recently":
        where.status = { category: "DONE" };
        orderBy = { updatedAt: "desc" };
        break;
      case "updated-recently":
        orderBy = { updatedAt: "desc" };
        break;
    }

    if (oProjectId) where.projectId = oProjectId;
    if (oAssignee) {
      if (oAssignee === "any") delete where.assigneeId;
      else if (oAssignee === "me") where.assigneeId = userId;
      else if (oAssignee === "unassigned") where.assigneeId = null;
      else where.assigneeId = oAssignee;
    }
    if (oReporter) {
      if (oReporter === "any") {
        delete where.reporterId;
        delete where.OR;
      } else if (oReporter === "me") {
        where.OR = [{ reporterId: userId }, { createdBy: userId }];
      } else {
        where.reporterId = oReporter;
      }
    }
    if (oType.length > 0) {
      where.type = oType.length === 1 ? (oType[0] as string) : { in: oType };
    }
    if (oStatusCat.length > 0) {
      where.status = oStatusCat.length === 1
        ? { category: oStatusCat[0] }
        : { category: { in: oStatusCat } };
    } else if (oResolution === "unresolved") {
      where.status = { category: { not: "DONE" } };
    } else if (oResolution === "done") {
      where.status = { category: "DONE" };
    } else if (oResolution === "any") {
      delete where.status;
    }

    if (search) {
      const text: Prisma.QtIssueWhereInput = {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { key: { contains: search, mode: "insensitive" } },
        ],
      };
      where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), text] : text;
    }

    // Custom-field value filters — each becomes an AND'd `fieldValues.some` clause
    // (same helper the Backlog/Board use). The UI only offers these once a project
    // is chosen, since field definitions are project-scoped.
    customFilterWhere = customFiltersToWhere(parseCustomFilters(url.searchParams.get("customFilters")));
    if (customFilterWhere.length > 0) {
      where.AND = where.AND
        ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), ...customFilterWhere]
        : customFilterWhere;
    }
  }

  const issueSelect = {
    id: true,
    key: true,
    title: true,
    type: true,
    priority: true,
    assigneeId: true,
    reporterId: true,
    statusId: true,
    parentId: true,
    epicId: true,
    sprintId: true,
    startDate: true,
    dueDate: true,
    storyPoints: true,
    eta: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, name: true, projectKey: true } },
    status: { select: { id: true, name: true, color: true, category: true } },
  } as const;

  const sortKey: "createdAt" | "updatedAt" =
    "createdAt" in orderBy ? "createdAt" : "updatedAt";

  // Discovery ideas live in a separate model (QtIdea) with no type/priority and
  // their own status. Include them alongside issues UNLESS the active filters
  // are issue-specific (a type filter, a priority-bearing type, or explicit
  // statusCategory that ideas can't match). Ideas map to type "IDEA".
  const ideasEligible = oType.length === 0;
  const ideaWhere: Prisma.QtIdeaWhereInput = { orgId, isDeleted: false, archivedFlag: false };
  if (oProjectId) ideaWhere.projectId = oProjectId;
  if (oAssignee === "me") ideaWhere.assigneeId = userId;
  else if (oAssignee === "unassigned") ideaWhere.assigneeId = null;
  else if (oAssignee && oAssignee !== "any") ideaWhere.assigneeId = oAssignee;
  if (oReporter === "me") ideaWhere.OR = [{ reporterId: userId }, { createdBy: userId }];
  else if (oReporter && oReporter !== "any") ideaWhere.reporterId = oReporter;
  if (search) {
    const s = [
      { title: { contains: search, mode: "insensitive" as const } },
      { key: { contains: search, mode: "insensitive" as const } },
    ];
    ideaWhere.AND = ideaWhere.OR ? [{ OR: s }] : undefined;
    if (!ideaWhere.AND) ideaWhere.OR = s;
  }
  // A slug that pins a DONE/not-DONE issue category, or a resolution toggle,
  // doesn't translate to idea statuses — exclude ideas so the list stays honest.
  const restrictsToIssueStatus =
    oStatusCat.length > 0 ||
    oResolution === "done" ||
    (!oResolution && (id === "done" || id === "open" || id === "my-open" || id === "resolved-recently"));

  // Fetch issues (paginated in SQL) and, when eligible, the ideas to merge in.
  // Ideas are merged in memory then the combined list is re-sorted + sliced, so
  // we over-fetch issues to `offset+limit` and cap ideas to a sane ceiling.
  // Custom-field filters target QtIssueFieldValue; ideas use a different value
  // relation, so when custom filters are active we don't merge ideas (they'd
  // otherwise appear unfiltered). TQL queries never merge ideas either — the
  // translator's where-clause targets QtIssue only and ideas would appear
  // unfiltered against it.
  const includeIdeas =
    !tqlRaw && ideasEligible && !restrictsToIssueStatus && customFilterWhere.length === 0;
  const [issueRows, issueCount, ideaRows, ideaCount] = await Promise.all([
    db.qtIssue.findMany({
      where,
      orderBy: tqlOrderBy ?? orderBy,
      take: includeIdeas ? offset + limit : limit,
      skip: includeIdeas ? 0 : offset,
      select: issueSelect,
    }),
    db.qtIssue.count({ where }),
    includeIdeas
      ? db.qtIdea.findMany({
          where: ideaWhere,
          orderBy,
          take: offset + limit,
          select: {
            id: true,
            key: true,
            title: true,
            assigneeId: true,
            reporterId: true,
            createdAt: true,
            updatedAt: true,
            project: { select: { id: true, name: true, projectKey: true } },
            status: { select: { id: true, name: true, color: true, category: true } },
          },
        })
      : Promise.resolve([]),
    includeIdeas ? db.qtIdea.count({ where: ideaWhere }) : Promise.resolve(0),
  ]);

  // Normalize both sources to the same row shape (ideas → type "IDEA").
  const normalizedIssues = issueRows.map((i) => ({ ...i }));
  const normalizedIdeas = ideaRows.map((i) => ({
    ...i,
    type: "IDEA",
    priority: "NONE",
  }));

  const merged = [...normalizedIssues, ...normalizedIdeas].sort((a, b) => {
    const av = a[sortKey] instanceof Date ? (a[sortKey] as Date).getTime() : 0;
    const bv = b[sortKey] instanceof Date ? (b[sortKey] as Date).getTime() : 0;
    return bv - av; // both orderings above are desc
  });
  const items = includeIdeas ? merged.slice(offset, offset + limit) : merged;
  const total = issueCount + ideaCount;

  // Resolve user display info for assignees + reporters in a single query.
  const userIds = Array.from(
    new Set(items.flatMap((i) => [i.assigneeId, i.reporterId]).filter((v): v is string => !!v)),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const data = items.map((i) => ({
    ...i,
    assignee: i.assigneeId ? userById.get(i.assigneeId) ?? null : null,
    reporter: i.reporterId ? userById.get(i.reporterId) ?? null : null,
  }));

  return NextResponse.json({
    success: true,
    data,
    total,
    meta: { title: FILTER_TITLES[id], fallback },
  });
});
