import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { emailIssueOverdue } from "@/lib/email/sendEmail";
import { safeSecretEqual } from "@/lib/secret-compare";
import { notifyDirect } from "@/lib/notifications/notify";

/**
 * Daily-cron-friendly endpoint that scans every project for overdue,
 * still-open work items and emails their assignees. Idempotent in the sense
 * that each invocation re-emails — designed to be hit once per day. If you
 * need exactly-once-per-overdue dedupe, add a `lastOverdueNotifiedAt` column
 * on QtIssue and gate the WHERE clause on it.
 *
 * Auth model: bearer token in `Authorization` header that must match the
 * server-side `CRON_SECRET` env var. No user session — this is server-to-
 * server. If `CRON_SECRET` is unset, the route refuses (fail-closed).
 *
 * Usage (Vercel Cron in vercel.json):
 *   { "crons": [{ "path": "/api/cron/overdue-notifications", "schedule": "0 9 * * *" }] }
 * Vercel automatically signs cron requests; if you set `CRON_SECRET` it'll
 * also include `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeSecretEqual(provided, expected)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all overdue, non-deleted, non-DONE issues with an assignee. We pull
  // status `category` along with the issue so the WHERE clause can exclude
  // DONE without a second query.
  const overdueIssues = await db.qtIssue.findMany({
    where: {
      isDeleted: false,
      assigneeId: { not: null },
      dueDate: { lt: now },
      status: { isNot: { category: "DONE" } },
    },
    select: {
      id: true,
      key: true,
      title: true,
      projectId: true,
      orgId: true,
      assigneeId: true,
      dueDate: true,
    },
    take: 1000, // safety cap — projects with > 1k overdues won't paginate, but they have bigger problems
  });

  if (overdueIssues.length === 0) {
    return NextResponse.json({ success: true, scanned: 0, emailed: 0 });
  }

  // Resolve assignees + project names in two batched queries.
  const userIds = Array.from(new Set(overdueIssues.map((i) => i.assigneeId).filter((x): x is string => Boolean(x))));
  const projectIds = Array.from(new Set(overdueIssues.map((i) => i.projectId)));
  const [users, projects] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    db.qtProject.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  let emailed = 0;
  for (const issue of overdueIssues) {
    if (!issue.assigneeId || !issue.dueDate) continue;
    const u = userById.get(issue.assigneeId);
    if (!u?.email) continue;
    const p = projectById.get(issue.projectId);
    await emailIssueOverdue({
      to: u.email,
      recipientName: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null,
      issue: {
        id: issue.id,
        key: issue.key,
        title: issue.title,
        projectId: issue.projectId,
        projectName: p?.name ?? null,
        dueDate: issue.dueDate.toISOString(),
      },
    });
    emailed++;
    await notifyDirect({
      orgId: issue.orgId,
      recipientId: issue.assigneeId,
      type: "OVERDUE",
      projectId: issue.projectId,
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      snippet: `Due ${issue.dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`,
      emailSent: true,
    });
  }

  return NextResponse.json({ success: true, scanned: overdueIssues.length, emailed });
}
