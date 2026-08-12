import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { runSingleWorkflow } from "@/lib/engine";
import type { EngineEvent } from "@/lib/engine/types";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/runs/:id/retry — replay a FAILED run (the "DLQ replay" step).
 * Reconstructs the original event from the durable WfRun (its workflow trigger +
 * captured triggerData) and re-runs the workflow inline, producing a fresh run.
 * Same permission rule as edit/toggle: personal → owner, org-wide → App Admin.
 */
export const POST = withOrgAuth<Params>(async ({ orgId, userId, isAdmin }, _req, { params }) => {
  const run = await db.wfRun.findFirst({
    where: {
      id: params.id,
      orgId,
      workflow: { OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }] },
    },
    select: {
      id: true,
      status: true,
      triggerData: true,
      workflow: {
        select: { id: true, scope: true, ownerId: true, trigger: true, graphNodes: true, graphEdges: true },
      },
    },
  });
  if (!run) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (run.status !== "failed") {
    return NextResponse.json({ success: false, error: "Only failed runs can be retried" }, { status: 400 });
  }
  const allowed = run.workflow.scope === "org" ? isAdmin : run.workflow.ownerId === userId;
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
  }

  const trigger = (run.workflow.trigger ?? {}) as Record<string, unknown>;
  const event: EngineEvent = {
    app: typeof trigger.app === "string" ? trigger.app : "quikscale",
    event: typeof trigger.event === "string" ? trigger.event : "manual.retry",
    orgId,
    // Fresh dedupe key so the retry isn't collapsed by the original run's key.
    dedupeKey: `retry:${run.id}:${Date.now()}`,
    data: (run.triggerData ?? {}) as Record<string, unknown>,
  };

  const result = await runSingleWorkflow(run.workflow, event);
  return NextResponse.json({ success: true, data: { run: result } });
});
