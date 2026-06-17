import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { enqueueAutomation } from "@/lib/queue/automation-queue";
import { requireRedisOr503 } from "@/lib/queue/guard";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

export const runtime = "nodejs";

const schema = z.object({ leadId: z.string().trim().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = requireRedisOr503();
    if (guard) return guard;
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "edit");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const wf = await prisma.crmWorkflowDefinition.findFirst({ where: { id, orgId: user.orgId } });
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nodes = (wf.graphNodes as unknown as WorkflowNode[]) ?? [];
    const edges = (wf.graphEdges as unknown as WorkflowEdge[]) ?? [];
    const trigger = nodes.find((n) => n.kind === wf.triggerType);
    const startNodeId = trigger ? edges.find((e) => e.from === trigger.id)?.to : null;
    if (!startNodeId) return NextResponse.json({ error: "Workflow has no entry node" }, { status: 400 });

    const jobId = await enqueueAutomation(
      {
        orgId: user.orgId,
        workflowId: wf.id,
        leadId: parsed.data.leadId,
        startNodeId,
        step: 0,
      },
      { jobId: `manual:${wf.id}:${parsed.data.leadId}:${Date.now()}` },
    );
    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    return errorResponse(e);
  }
}
