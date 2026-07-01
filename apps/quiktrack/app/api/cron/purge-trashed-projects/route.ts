import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * Permanently deletes projects that have been in the trash (soft-deleted) for
 * longer than the retention window. This is what backs the "…permanently
 * deleted after 60 days" promise in the Move-to-trash dialog.
 *
 * Cascade: every QtProject child relation (issues, docs, sprints, members,
 * roles, custom fields, …) is declared `onDelete: Cascade`, so a single
 * `qtProject.delete` removes the whole tree. Failures are isolated per project
 * so one bad row can't block the rest of the sweep.
 *
 * Trash age: QtProject has no dedicated `deletedAt` column, so we use
 * `updatedAt` as a proxy — it's stamped when the project is trashed and nothing
 * mutates a trashed project afterwards (its pages are unreachable), so it holds
 * steady at the trash time. TODO(integration): add a `deletedAt` column for an
 * exact retention clock.
 *
 * Auth: server-to-server bearer token matching `CRON_SECRET` (fail-closed).
 * Schedule via vercel.json, e.g.:
 *   { "crons": [{ "path": "/api/cron/purge-trashed-projects", "schedule": "0 3 * * *" }] }
 */
const RETENTION_DAYS = 60;

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
  if (provided !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expired = await db.qtProject.findMany({
    where: { isDeleted: true, updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 500, // safety cap per run; the next run picks up any remainder
  });

  let purged = 0;
  const failed: string[] = [];
  for (const { id } of expired) {
    try {
      await db.qtProject.delete({ where: { id } });
      purged++;
    } catch {
      // Leave it in the trash and try again next run rather than failing the
      // whole sweep (e.g. a transient FK/lock issue).
      failed.push(id);
    }
  }

  return NextResponse.json({
    success: true,
    scanned: expired.length,
    purged,
    failed: failed.length,
    retentionDays: RETENTION_DAYS,
  });
}
