import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { syncSchedule } from "@/lib/schedule/persist";

type Params = { id: string };

const toggleSchema = z.object({ on: z.boolean() });

/**
 * PATCH /api/workflows/:id/toggle — flip a workflow Live (Active) ⇄ Paused.
 * Members can toggle their own personal workflows; org-wide toggles require
 * App Admin (PRD FR-D2, FR-E4).
 */
export const PATCH = withOrgAuth<Params>(async ({ orgId, userId, isAdmin }, req, { params }) => {
  const wf = await db.wfWorkflow.findFirst({
    where: {
      id: params.id,
      orgId,
      OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }],
    },
  });
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const allowed = wf.scope === "org" ? isAdmin : wf.ownerId === userId;
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
  }

  const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const updated = await db.wfWorkflow.update({
    where: { id: params.id },
    data: { status: parsed.data.on ? "Active" : "Paused" },
    select: { id: true, status: true },
  });

  // Keep the WfSchedule row in sync for time-triggered workflows (upsert when
  // turned Live + scheduled, remove otherwise).
  await syncSchedule({ orgId, workflowId: params.id, trigger: wf.trigger, active: parsed.data.on });

  return NextResponse.json({ success: true, data: updated });
});
