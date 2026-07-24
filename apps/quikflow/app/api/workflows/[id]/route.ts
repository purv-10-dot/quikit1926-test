import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { syncSchedule } from "@/lib/schedule/persist";

type Params = { id: string };

/** Fetch a workflow the caller is allowed to see, or null. */
async function loadVisible(orgId: string, userId: string, id: string) {
  return db.wfWorkflow.findFirst({
    where: {
      id,
      orgId,
      OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }],
    },
  });
}

/** GET /api/workflows/:id — full definition + recent steps. */
export const GET = withOrgAuth<Params>(async ({ orgId, userId }, _req, { params }) => {
  const wf = await loadVisible(orgId, userId, params.id);
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: wf });
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  trigger: z.record(z.unknown()).optional(),
  graphNodes: z.array(z.unknown()).optional(),
  graphEdges: z.array(z.unknown()).optional(),
});

/**
 * PATCH /api/workflows/:id — edit definition. Members may edit only their own
 * personal workflows; org-wide edits require App Admin (PRD FR-E4).
 */
export const PATCH = withOrgAuth<Params>(async ({ orgId, userId, isAdmin }, req, { params }) => {
  const wf = await loadVisible(orgId, userId, params.id);
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const editable = wf.scope === "org" ? isAdmin : wf.ownerId === userId;
  if (!editable) {
    return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await db.wfWorkflow.update({
    where: { id: params.id },
    data: parsed.data as Prisma.WfWorkflowUpdateInput,
  });

  // Re-sync the schedule when an Active workflow's trigger changes (recurrence /
  // time edits, or switching to/from a schedule.tick trigger).
  await syncSchedule({
    orgId,
    workflowId: params.id,
    trigger: parsed.data.trigger ?? wf.trigger,
    active: wf.status === "Active",
  });

  return NextResponse.json({ success: true, data: { id: params.id } });
});

/** DELETE /api/workflows/:id — same permission rule as PATCH. */
export const DELETE = withOrgAuth<Params>(async ({ orgId, userId, isAdmin }, _req, { params }) => {
  const wf = await loadVisible(orgId, userId, params.id);
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const canDelete = wf.scope === "org" ? isAdmin : wf.ownerId === userId;
  if (!canDelete) {
    return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
  }
  await db.wfWorkflow.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: { id: params.id } });
});
