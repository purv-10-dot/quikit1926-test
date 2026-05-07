import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

type GroupBy = "user" | "project" | "issue";

function dateKey(d: Date): string {
  // Render date as YYYY-MM-DD in the server's local TZ. The client interprets
  // the same format consistently, and the cell layout is day-granular so we
  // don't need a finer slot than that.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Aggregated grid of logged hours for the timesheet view.
 *
 * Query params:
 *   from         — ISO start date (inclusive)
 *   to           — ISO end date (inclusive)
 *   projectId    — optional, scope to a single project
 *   groupBy      — "user" (per-project view) | "project" (global all-projects view)
 *
 * Returns:
 *   {
 *     rows:   [{ id, label }],          // sorted, includes "totals" implicitly
 *     cells:  { [rowId]: { [yyyy-mm-dd]: { hours, entryIds: string[] } } },
 *   }
 *
 * The `entryIds` per cell let the inline editor decide between PATCH (single
 * entry) and a smarter merge (when a user logged multiple entries on the same
 * day and project — we PATCH the first and DELETE the rest, then create a
 * fresh row to represent the new total).
 */
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

  // Tenant-admins see everything; everyone else is constrained to projects
  // they're a member of.
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

  // Bucket entries → rows × dateKeys.
  type Cell = { hours: number; entryIds: string[] };
  const cells: Record<string, Record<string, Cell>> = {};
  const rowIds = new Set<string>();
  for (const e of entries) {
    const rowId =
      groupBy === "project" ? e.projectId : groupBy === "issue" ? e.issueId : e.userId;
    rowIds.add(rowId);
    const key = dateKey(new Date(e.entryDate));
    cells[rowId] ??= {};
    const cell = (cells[rowId][key] ??= { hours: 0, entryIds: [] });
    cell.hours += e.hours || 0;
    cell.entryIds.push(e.id);
  }

  // Resolve labels for the row IDs.
  let rows: {
    id: string;
    label: string;
    secondary?: string | null;
    meta?: { color?: string | null; icon?: string | null; type?: string | null };
  }[] = [];
  if (groupBy === "project") {
    const projects = await db.qtProject.findMany({
      where: { id: { in: Array.from(rowIds) }, orgId: orgId },
      select: { id: true, name: true, color: true, icon: true },
    });
    rows = projects
      .map((p) => ({ id: p.id, label: p.name, meta: { color: p.color, icon: p.icon } }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } else if (groupBy === "issue") {
    const issues = await db.qtIssue.findMany({
      where: { id: { in: Array.from(rowIds) }, orgId: orgId },
      select: { id: true, key: true, title: true, type: true },
    });
    rows = issues
      .map((i) => ({
        id: i.id,
        label: i.title || "Untitled",
        secondary: i.key,
        meta: { type: i.type },
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } else {
    const users = await db.user.findMany({
      where: { id: { in: Array.from(rowIds) } },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
    });
    rows = users
      .map((u) => {
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
        return { id: u.id, label: name };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return NextResponse.json({ success: true, data: { rows, cells } });
});
