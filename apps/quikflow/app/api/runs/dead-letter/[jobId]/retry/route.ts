import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { replayDeadLetter } from "@/lib/queue/dead-letter";

export const runtime = "nodejs";

type Params = { jobId: string };

/**
 * POST /api/runs/dead-letter/:jobId/retry — replay a dead-lettered job. Ops-level
 * action (App Admin only). Tenant-isolated: a job from another org 404s.
 */
export const POST = withOrgAuth<Params>(
  async ({ orgId }, _req, { params }) => {
    const ok = await replayDeadLetter(orgId, params.jobId);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: params.jobId, replayed: true } });
  },
  { requireAdmin: true },
);
