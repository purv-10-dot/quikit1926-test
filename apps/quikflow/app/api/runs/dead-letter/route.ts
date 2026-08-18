import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { listDeadLetters } from "@/lib/queue/dead-letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/runs/dead-letter — jobs that exhausted all retries, for this org.
 * These never produced a WfRun (dispatch/infra failures); replay via
 * POST /api/runs/dead-letter/[jobId]/retry.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  const data = await listDeadLetters(orgId);
  return NextResponse.json({ success: true, data });
});
