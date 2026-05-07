import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET /api/filters/:id?search=&limit=&offset=
 *
 * Returns work items matching one of the platform's default filters.
 * Filter ids are slugs (kebab-case) and map to a fixed Prisma where/orderBy
 * pair. Unknown ids → 404.
 *
 * NOTE: "viewed-recently" has no view-tracking source yet; it falls back to
 * `updatedAt desc` and is flagged via `meta.fallback` so the UI can warn.
 */

export type FilterId =
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

  // Toolbar overrides — when set, they replace the slug's implicit filter
  // for that field. Slug-derived filters still apply for fields the toolbar
  // doesn't touch.
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

  const [items, total] = await Promise.all([
    db.qtIssue.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        priority: true,
        assigneeId: true,
        reporterId: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true, projectKey: true } },
        status: { select: { id: true, name: true, color: true, category: true } },
      },
    }),
    db.qtIssue.count({ where }),
  ]);

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
