import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, isProjectSpaceAdmin } from "@/lib/api/permissions";

type GroupBy = "user" | "project" | "issue" | "user-issue" | "epic-issue";

// Synthetic parent id for work items that don't belong to any epic.
const NO_EPIC = "__noepic__";

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const projectId = url.searchParams.get("projectId");
  const groupBy = (url.searchParams.get("groupBy") as GroupBy | null) ?? "user";

  const parseIdList = (raw: string | null): string[] =>
    raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const userIdFilter = parseIdList(url.searchParams.get("userIds"));
  const projectIdFilter = parseIdList(url.searchParams.get("projectIds"));

  if (!from || !to) {
    return NextResponse.json(
      { success: false, error: "from and to are required" },
      { status: 400 },
    );
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });
  }

  const isAdmin = await hasAdminAccess(userId, orgId);

  let allowedProjectIds: string[] | null = null;
  if (!isAdmin) {
    const memberships = await db.qtProjectMember.findMany({
      where: { userId, isDeleted: false },
      select: { projectId: true },
    });
    allowedProjectIds = memberships.map((m) => m.projectId);
    if (projectId && !allowedProjectIds.includes(projectId)) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
  }

  // Only app admins and a project's Space Admin may see everyone's timesheets.
  // Everyone else is scoped to their OWN entries — so a Contributor/Viewer can
  // never read a teammate's logged time. (Space Admin only applies to the locked
  // space-scoped view; a cross-project global view stays self-only unless app admin.)
  const canSeeAll =
    isAdmin || (!!projectId && (await isProjectSpaceAdmin(userId, projectId)));

  // Resolve the effective project constraint. A locked `projectId` (space-scoped
  // view) always wins. Otherwise we intersect the optional projectIds filter with
  // the caller's allowed projects so a non-admin can't widen their own scope.
  let projectWhere: Record<string, unknown> = {};
  if (projectId) {
    projectWhere = { projectId };
  } else {
    let ids: string[] | null = projectIdFilter.length > 0 ? projectIdFilter : null;
    if (allowedProjectIds) {
      ids = ids ? ids.filter((id) => allowedProjectIds!.includes(id)) : allowedProjectIds;
    }
    if (ids) projectWhere = { projectId: { in: ids } };
  }

  const entries = await db.qtTimesheetEntry.findMany({
    where: {
      orgId: orgId,
      isDeleted: false,
      entryDate: { gte: fromDate, lte: toDate },
      ...projectWhere,
      // Self-only unless the caller may see all; otherwise apply the optional
      // user filter. A non-privileged caller's userIds param is ignored.
      ...(canSeeAll
        ? userIdFilter.length > 0
          ? { userId: { in: userIdFilter } }
          : {}
        : { userId }),
    },
    select: {
      id: true,
      userId: true,
      projectId: true,
      issueId: true,
      entryDate: true,
      hours: true,
    },
  });

  // Epic grouping needs each work item's parent epic. Resolve it up-front so the
  // bump loop can map issueId → epicId (null → the "No epic" bucket).
  let epicByIssue = new Map<string, string | null>();
  if (groupBy === "epic-issue") {
    const entryIssueIds = Array.from(new Set(entries.map((e) => e.issueId)));
    const issuesForEpic = entryIssueIds.length
      ? await db.qtIssue.findMany({
          where: { id: { in: entryIssueIds }, orgId },
          select: { id: true, epicId: true },
        })
      : [];
    epicByIssue = new Map(issuesForEpic.map((i) => [i.id, i.epicId]));
  }

  type Cell = { hours: number; entryIds: string[] };
  const cells: Record<string, Record<string, Cell>> = {};
  const userIds = new Set<string>();
  const issueIds = new Set<string>();
  const projectIds = new Set<string>();
  const epicIds = new Set<string>();

  function bumpCell(rowId: string, key: string, hours: number, entryId: string) {
    cells[rowId] ??= {};
    const cell = (cells[rowId][key] ??= { hours: 0, entryIds: [] });
    cell.hours += hours;
    cell.entryIds.push(entryId);
  }

  for (const e of entries) {
    const key = dateKey(new Date(e.entryDate));
    if (groupBy === "user-issue") {
      userIds.add(e.userId);
      issueIds.add(e.issueId);
      bumpCell(e.userId, key, e.hours || 0, e.id);
      bumpCell(`${e.userId}::${e.issueId}`, key, e.hours || 0, e.id);
    } else if (groupBy === "epic-issue") {
      const epicId = epicByIssue.get(e.issueId) ?? NO_EPIC;
      epicIds.add(epicId);
      issueIds.add(e.issueId);
      bumpCell(epicId, key, e.hours || 0, e.id);
      bumpCell(`${epicId}::${e.issueId}`, key, e.hours || 0, e.id);
    } else {
      const rowId =
        groupBy === "project" ? e.projectId :
        groupBy === "issue" ? e.issueId : e.userId;
      if (groupBy === "project") projectIds.add(rowId);
      else if (groupBy === "issue") issueIds.add(rowId);
      else userIds.add(rowId);
      bumpCell(rowId, key, e.hours || 0, e.id);
    }
  }

  type Row = {
    id: string;
    label: string;
    secondary?: string | null;
    parentId?: string | null;
    kind?: "user" | "issue" | "project";
    meta?: { color?: string | null; icon?: string | null; type?: string | null };
  };
  let rows: Row[] = [];

  if (groupBy === "project") {
    const projects = await db.qtProject.findMany({
      where: { id: { in: Array.from(projectIds) }, orgId: orgId },
      select: { id: true, name: true, color: true, icon: true },
    });
    rows = projects
      .map((p) => ({ id: p.id, label: p.name, kind: "project" as const, meta: { color: p.color, icon: p.icon } }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } else if (groupBy === "issue") {
    const issues = await db.qtIssue.findMany({
      where: { id: { in: Array.from(issueIds) }, orgId: orgId },
      select: { id: true, key: true, title: true, type: true },
    });
    rows = issues
      .map((i) => ({
        id: i.id,
        label: i.title || "Untitled",
        secondary: i.key,
        kind: "issue" as const,
        meta: { type: i.type },
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } else if (groupBy === "user-issue") {
    const [users, issues] = await Promise.all([
      db.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      db.qtIssue.findMany({
        where: { id: { in: Array.from(issueIds) }, orgId },
        select: { id: true, key: true, title: true, type: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u] as const));
    const issueById = new Map(issues.map((i) => [i.id, i] as const));
    const childPairs = new Set<string>();
    for (const rowId of Object.keys(cells)) if (rowId.includes("::")) childPairs.add(rowId);

    const sortedUsers = [...userIds]
      .map((id) => userById.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .sort((a, b) => {
        const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email;
        const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.email;
        return an.localeCompare(bn);
      });

    for (const u of sortedUsers) {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
      rows.push({ id: u.id, label: name, kind: "user", parentId: null });
      const childIssueIds = [...childPairs]
        .filter((p) => p.startsWith(`${u.id}::`))
        .map((p) => p.slice(u.id.length + 2));
      const children = childIssueIds
        .map((iid) => issueById.get(iid))
        .filter((i): i is NonNullable<typeof i> => Boolean(i))
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const i of children) {
        rows.push({
          id: `${u.id}::${i.id}`,
          label: i.title || "Untitled",
          secondary: i.key,
          parentId: u.id,
          kind: "issue",
          meta: { type: i.type },
        });
      }
    }
  } else if (groupBy === "epic-issue") {
    const realEpicIds = [...epicIds].filter((id) => id !== NO_EPIC);
    const [epics, issues] = await Promise.all([
      realEpicIds.length
        ? db.qtIssue.findMany({
            where: { id: { in: realEpicIds }, orgId },
            select: { id: true, key: true, title: true, type: true },
          })
        : Promise.resolve([]),
      db.qtIssue.findMany({
        where: { id: { in: Array.from(issueIds) }, orgId },
        select: { id: true, key: true, title: true, type: true },
      }),
    ]);
    const epicById = new Map(epics.map((e) => [e.id, e] as const));
    const issueById = new Map(issues.map((i) => [i.id, i] as const));
    const childPairs = new Set<string>();
    for (const rowId of Object.keys(cells)) if (rowId.includes("::")) childPairs.add(rowId);

    // Real epics first (alphabetical), the "No epic" bucket last.
    const epicOrder = [...epicIds].sort((a, b) => {
      if (a === NO_EPIC) return 1;
      if (b === NO_EPIC) return -1;
      const at = epicById.get(a)?.title ?? "";
      const bt = epicById.get(b)?.title ?? "";
      return at.localeCompare(bt);
    });

    for (const eid of epicOrder) {
      const epic = eid === NO_EPIC ? null : epicById.get(eid);
      rows.push({
        id: eid,
        label: epic ? epic.title || "Untitled" : "No epic",
        secondary: epic?.key ?? null,
        parentId: null,
        kind: "issue",
        meta: epic ? { type: epic.type } : undefined,
      });
      const childIssueIds = [...childPairs]
        .filter((p) => p.startsWith(`${eid}::`))
        .map((p) => p.slice(eid.length + 2));
      const children = childIssueIds
        .map((iid) => issueById.get(iid))
        .filter((i): i is NonNullable<typeof i> => Boolean(i))
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const i of children) {
        rows.push({
          id: `${eid}::${i.id}`,
          label: i.title || "Untitled",
          secondary: i.key,
          parentId: eid,
          kind: "issue",
          meta: { type: i.type },
        });
      }
    }
  } else {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
    });
    rows = users
      .map((u) => {
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
        return { id: u.id, label: name, kind: "user" as const };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // `canSeeAll` lets the client hide the per-user filter for self-only callers.
  return NextResponse.json({ success: true, data: { rows, cells, canSeeAll } });
});
