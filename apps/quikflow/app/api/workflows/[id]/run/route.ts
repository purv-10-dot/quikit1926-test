import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { runSingleWorkflow } from "@/lib/engine";
import type { EngineEvent } from "@/lib/engine/types";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/workflows/:id/run — "Run now". Executes a single workflow
 * immediately through the engine (inline, bypassing the matcher + queue) so a
 * user can test ANY workflow on demand — including Drafts — and see the run in
 * Run History right away. The real QuikScale-triggered path goes through
 * /api/events → GroupMQ → worker instead.
 */
export const POST = withOrgAuth<Params>(async ({ orgId, userId }, _req, { params }) => {
  const wf = await db.wfWorkflow.findFirst({
    where: {
      id: params.id,
      orgId,
      OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }],
    },
    select: { id: true, trigger: true, graphNodes: true, graphEdges: true },
  });
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
  const event: EngineEvent = {
    app: typeof trigger.app === "string" ? trigger.app : "quikflow",
    event: typeof trigger.event === "string" ? trigger.event : "manual.run",
    orgId,
    // Unique per click so repeated manual runs each create a new WfRun.
    dedupeKey: `runnow:${params.id}:${Date.now()}`,
    data: { manual: true, triggeredBy: userId },
    occurredAt: new Date().toISOString(),
  };

  const result = await runSingleWorkflow(wf, event);
  return NextResponse.json({ success: true, data: { run: result } });
});
