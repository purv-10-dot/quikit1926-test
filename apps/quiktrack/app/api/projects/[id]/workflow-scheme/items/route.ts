import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * PUT /api/projects/[id]/workflow-scheme/items
 * Replace the scheme's issue-type → workflow assignments (the "Assign Issue
 * Types" table). Exactly one default (issueTypeId null) must be present; every
 * referenced workflow must belong to this project.
 */
const bodySchema = z.object({
  defaultWorkflowId: z.string().min(1),
  items: z
    .array(z.object({ issueTypeId: z.string().min(1), workflowId: z.string().min(1) }))
    .default([]),
});

export const PUT = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId }, req) => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { defaultWorkflowId, items } = parsed.data;

    const scheme = await db.qtWorkflowScheme.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (!scheme) {
      return NextResponse.json(
        { success: false, error: "This space has no workflow scheme yet." },
        { status: 404 },
      );
    }

    // Every referenced workflow must belong to this project (or be an org
    // template usable by it) and not be soft-deleted.
    const referencedIds = [defaultWorkflowId, ...items.map((i) => i.workflowId)];
    const valid = await db.qtWorkflow.findMany({
      where: {
        id: { in: referencedIds },
        orgId,
        isDeleted: false,
        OR: [{ projectId }, { projectId: null }],
      },
      select: { id: true },
    });
    const validIds = new Set(valid.map((w) => w.id));
    for (const id of referencedIds) {
      if (!validIds.has(id)) {
        return NextResponse.json(
          { success: false, error: "A selected workflow is not available in this space." },
          { status: 400 },
        );
      }
    }

    // Reject a type mapped twice.
    const typeIds = items.map((i) => i.issueTypeId);
    if (new Set(typeIds).size !== typeIds.length) {
      return NextResponse.json(
        { success: false, error: "An issue type is assigned more than once." },
        { status: 400 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.qtWorkflowSchemeItem.deleteMany({ where: { schemeId: scheme.id } });
      await tx.qtWorkflowSchemeItem.create({
        data: {
          schemeId: scheme.id,
          issueTypeId: null,
          workflowId: defaultWorkflowId,
          isDefault: true,
        },
      });
      if (items.length > 0) {
        await tx.qtWorkflowSchemeItem.createMany({
          data: items.map((i) => ({
            schemeId: scheme.id,
            issueTypeId: i.issueTypeId,
            workflowId: i.workflowId,
            isDefault: false,
          })),
        });
      }
    });

    return NextResponse.json({ success: true, data: { updated: true } });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
