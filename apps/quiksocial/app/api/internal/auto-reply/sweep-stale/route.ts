/**
 * POST /api/internal/auto-reply/sweep-stale
 *
 * Flips PENDING log rows older than `olderThanMinutes` (default 3) to
 * FAILED. Mirrors v1's stale-queued retry behavior (autoReplyMonitorWorker
 * line ~437 in the v1 reference repo).
 *
 * Called by the Python monitor at the start of each tick. Scoped to one
 * (orgId, socialAccountId).
 *
 * Accepts both `orgId` (canonical) and `tenantId` (legacy wire-format
 * from the Python service).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import { SweepStaleSchema, resolveOrgId } from "@/lib/auto-reply/types";

export async function POST(req: NextRequest) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = SweepStaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { socialAccountId, olderThanMinutes } = parsed.data;
  const orgId = resolveOrgId(parsed.data);
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 422 },
    );
  }

  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  const result = await db.autoReplyLog.updateMany({
    where: {
      orgId,
      socialAccountId,
      status: "PENDING",
      sentAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      failureReason: `Pending reservation expired after ${olderThanMinutes} minutes`,
    },
  });

  return NextResponse.json({ swept: result.count });
}
