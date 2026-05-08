/**
 * GET /api/posts/overdue
 *
 * On-demand overdue sweep — same logic the cron uses, exposed as an
 * admin endpoint for one-off recovery (e.g. after a long Vercel cold
 * start backlog).
 *
 * A post is overdue when:
 *   - status = "scheduled"
 *   - scheduledFor < (now - OVERDUE_GRACE_MS)
 *
 * Per CLAUDE.md: overdue posts do NOT auto-publish. Admin must act.
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { PostStatus } from "@/types/post-status";

const OVERDUE_GRACE_MS = 5 * 60 * 1000;

export const GET = withOrgAuth(async ({ orgId }) => {
  const overdueCutoff = new Date(Date.now() - OVERDUE_GRACE_MS);

  const stale = await db.post.findMany({
    where: {
      orgId,
      status: PostStatus.Scheduled,
      scheduledFor: { lt: overdueCutoff },
    },
    select: { id: true },
    take: 500,
  });

  if (stale.length === 0) {
    return NextResponse.json({
      success: true,
      data: { count: 0, updatedIds: [] },
    });
  }

  const ids = stale.map((p) => p.id);
  const result = await db.post.updateMany({
    where: { id: { in: ids } },
    data: { status: PostStatus.Overdue },
  });

  return NextResponse.json({
    success: true,
    data: { count: result.count, updatedIds: ids },
  });
});
