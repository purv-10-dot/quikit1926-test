/**
 * Shared work-item filter parsing/where-building.
 *
 * WHY THIS EXISTS. The backlog renders a section's count and the section's rows
 * from two different endpoints — `/api/issues/section-counts` for the collapsed
 * header, `/api/issues` for the list once it expands. Each had its own hand-
 * written copy of the same `where`, so every filter added to one and forgotten
 * in the other produced a header that contradicted its own body: "2 work items"
 * collapsed, "No items in this sprint" expanded. Both routes now build their
 * filter clauses here, so a new filter is wired into both by construction.
 *
 * Only the SHARED subset lives here. Params that mean different things per
 * route — sprintId/parentId/releaseId, the status-list and status-category
 * variants, pagination, sorting — stay in their own routes and are composed
 * alongside these fragments.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { customFiltersToWhere, parseCustomFilters } from "@/lib/customFields/filterQuery";

export interface IssueFilters {
  search: string;
  statusId: string | null;
  type: string | null;
  /** Comma list of types to exclude when no explicit `type` is given. */
  excludeType: string | null;
  assigneeId: string | null;
  priority: string | null;
  epicId: string | null;
  /** "none" selects items with no due date at all. */
  dueMode: string | null;
  /** Inclusive ISO bounds. The client resolves its preset to absolute
   *  instants because only the browser knows the viewer's local day. */
  dueFrom: string | null;
  dueTo: string | null;
  customFilterWhere: Prisma.QtIssueWhereInput[];
}

export function parseIssueFilters(url: URL): IssueFilters {
  const p = url.searchParams;
  return {
    search: p.get("search")?.trim() ?? "",
    statusId: p.get("statusId"),
    type: p.get("type"),
    excludeType: p.get("excludeType"),
    assigneeId: p.get("assigneeId"),
    priority: p.get("priority"),
    epicId: p.get("epicId"),
    dueMode: p.get("dueDate"),
    dueFrom: p.get("dueFrom"),
    dueTo: p.get("dueTo"),
    customFilterWhere: customFiltersToWhere(parseCustomFilters(p.get("customFilters"))),
  };
}

/**
 * assigneeId supports four shapes:
 *   "null"        → unassigned only
 *   "id"          → single assignee
 *   "id1,id2"     → IN-list (multi-assignee filter)
 *   "null,id1"    → unassigned OR any of the listed assignees
 */
export function assigneeFragment(raw: string | null): Prisma.QtIssueWhereInput | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const wantsUnassigned = parts.includes("null");
  const ids = parts.filter((p) => p !== "null");
  if (wantsUnassigned && ids.length)
    return { OR: [{ assigneeId: null }, { assigneeId: { in: ids } }] };
  if (wantsUnassigned) return { assigneeId: null };
  if (ids.length === 1) return { assigneeId: ids[0] };
  return { assigneeId: { in: ids } };
}

/**
 * Due-date range. An unparseable bound is ignored rather than fatal — a stale
 * URL param must not 500 the board.
 */
export function dueDateFragment(
  mode: string | null,
  from: string | null,
  to: string | null,
): Prisma.QtIssueWhereInput | null {
  if (mode === "none") return { dueDate: null };
  const parse = (raw: string | null) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const gte = parse(from);
  const lte = parse(to);
  if (!gte && !lte) return null;
  return { dueDate: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

/**
 * A specific `type` filter wins over `excludeType` (the backlog's structural
 * EPIC/SUBTASK exclusion) — otherwise picking "Bug" would silently fall back to
 * "everything except epics and subtasks".
 */
export function typeFragment(
  type: string | null,
  excludeType: string | null,
): Prisma.QtIssueWhereInput | null {
  if (type) return { type };
  if (!excludeType) return null;
  const list = excludeType.split(",").filter(Boolean);
  return list.length > 1 ? { type: { notIn: list } } : { type: { not: list[0] } };
}

/**
 * Every shared filter as AND-able fragments. Prisma treats a top-level key and
 * a single-element AND identically, so composing this way is equivalent to the
 * spreads it replaces — and it keeps clauses that carry their own `OR`
 * (assignee, search) from colliding with each other.
 *
 * `includeStatus: false` lets `/api/issues` keep its richer status handling
 * (status id-list / category / board-mapped) without this fragment fighting it.
 */
export function issueFilterFragments(
  f: IssueFilters,
  opts: { includeStatus?: boolean } = {},
): Prisma.QtIssueWhereInput[] {
  const { includeStatus = true } = opts;
  const out: Prisma.QtIssueWhereInput[] = [];

  const typeWhere = typeFragment(f.type, f.excludeType);
  if (typeWhere) out.push(typeWhere);

  if (includeStatus && f.statusId) out.push({ statusId: f.statusId });

  if (f.epicId === "null") out.push({ epicId: null });
  else if (f.epicId) out.push({ epicId: f.epicId });

  if (f.priority) out.push({ priority: f.priority });

  if (f.search) {
    out.push({
      OR: [
        { title: { contains: f.search, mode: "insensitive" as const } },
        { description: { contains: f.search, mode: "insensitive" as const } },
        { key: { contains: f.search, mode: "insensitive" as const } },
      ],
    });
  }

  const assignee = assigneeFragment(f.assigneeId);
  if (assignee) out.push(assignee);

  const due = dueDateFragment(f.dueMode, f.dueFrom, f.dueTo);
  if (due) out.push(due);

  out.push(...f.customFilterWhere);
  return out;
}

/**
 * Statuses mapped to a board column. The backlog and board only show items on
 * mapped statuses, so any count that claims to describe those views has to
 * apply the same restriction.
 *
 * Returns null when the project has no configured columns — then nothing is
 * "unmapped" and no restriction applies.
 */
export async function boardMappedStatusIds(projectId: string): Promise<string[] | null> {
  const hasColumns = await db.qtBoardColumn.findFirst({
    where: { projectId },
    select: { id: true },
  });
  if (!hasColumns) return null;
  const mapped = await db.qtBoardColumnStatus.findMany({
    where: { column: { projectId } },
    select: { statusId: true },
  });
  return mapped.map((m) => m.statusId);
}
