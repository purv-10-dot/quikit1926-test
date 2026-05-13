import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

type GroupBy = "user" | "project" | "issue" | "user-issue";

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

  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";

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

  const entries = await db.qtTimesheetEntry.findMany({
    where: {
      orgId: orgId,
      isDeleted: false,
      entryDate: { gte: fromDate, lte: toDate },
      ...(projectId ? { projectId } : {}),
      ...(allowedProjectIds && !projectId
        ? { projectId: { in: allowedProjectIds } }
        : {}),
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

  type Cell = { hours: number; entryIds: string[] };
  const cells: Record<string, Record<string, Cell>> = {};
  const userIds = new Set<string>();
  const issueIds = new Set<string>();
  const projectIds = new Set<string>();

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

  return NextResponse.json({ success: true, data: { rows, cells } });
});
