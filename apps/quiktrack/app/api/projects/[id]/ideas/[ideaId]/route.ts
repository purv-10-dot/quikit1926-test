import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { updateIdeaSchema } from "@/lib/validation/idea";
import { writeIdeaValues, getValuesForIdea } from "@/lib/services/ideaFieldValues";

/**
 * A single idea. PATCH edits core fields and/or custom-field values (Score is
 * recomputed automatically when its inputs change). DELETE is a PERMANENT delete
 * restricted to Space Admins (FR §5.3) — archiving is a PATCH { archivedFlag }.
 */

async function loadIdea(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({
    where: { id: ideaId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
}

export const PATCH = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = updateIdeaSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const existing = await loadIdea(orgId, projectId, params.ideaId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }

    const { values, ...core } = parsed.data;
    try {
      const coreData: Record<string, unknown> = { updatedBy: userId };
      if (core.title !== undefined) coreData.title = core.title;
      if (core.description !== undefined) coreData.description = core.description;
      if (core.statusId !== undefined) coreData.statusId = core.statusId;
      if (core.assigneeId !== undefined) coreData.assigneeId = core.assigneeId;
      if (core.archivedFlag !== undefined) coreData.archivedFlag = core.archivedFlag;
      if (core.orderIndex !== undefined) coreData.orderIndex = core.orderIndex;
      if (Object.keys(coreData).length > 1) {
        await db.qtIdea.update({ where: { id: params.ideaId }, data: coreData });
      }
      if (values && Object.keys(values).length > 0) {
        const res = await writeIdeaValues({
          orgId, ideaId: params.ideaId, projectId, actorId: userId, values,
        });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: res.errors.join(", ") }, { status: 400 });
        }
      }

      const freshValues = await getValuesForIdea(orgId, params.ideaId);
      return NextResponse.json({ success: true, data: { id: params.ideaId, values: freshValues } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update idea";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);

export const DELETE = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    const existing = await loadIdea(orgId, projectId, params.ideaId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    // Hard delete — cascades QtIdeaFieldValue rows. Idea:delete is granted only
    // to Space Admin (+ global admins bypass), so Contributors can't reach here.
    await db.qtIdea.delete({ where: { id: params.ideaId } });
    return NextResponse.json({ success: true, data: { id: params.ideaId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "delete" } },
);
