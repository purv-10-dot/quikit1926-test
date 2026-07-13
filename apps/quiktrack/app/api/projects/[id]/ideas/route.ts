import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { getActiveFieldsForProject } from "@/lib/services/customFieldValues";
import { getValuesForIdeas, writeIdeaValues } from "@/lib/services/ideaFieldValues";
import { createIdeaSchema } from "@/lib/validation/idea";

/**
 * Discovery ideas for a project. GET returns the full bundle the "All ideas"
 * Table view renders from — ideas (with their custom-field values), the active
 * field definitions, the idea funnel statuses, and the saved views — so the
 * table paints from a single request. POST quick-creates an idea.
 */

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }, req) => {
    const showArchived = new URL(req.url).searchParams.get("archived") === "true";

    const [ideas, fields, statuses, views] = await Promise.all([
      db.qtIdea.findMany({
        where: { orgId, projectId, isDeleted: false, ...(showArchived ? {} : { archivedFlag: false }) },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, key: true, title: true, description: true, statusId: true,
          assigneeId: true, reporterId: true, archivedFlag: true, orderIndex: true,
          createdAt: true, updatedAt: true,
        },
      }),
      getActiveFieldsForProject(orgId, projectId),
      db.qtIdeaStatus.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true, color: true, category: true, orderIndex: true },
      }),
      db.qtIdeaView.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true, type: true, config: true, visibility: true, isDefault: true },
      }),
    ]);

    const valuesByIdea = await getValuesForIdeas(orgId, ideas.map((i) => i.id));
    const data = ideas.map((i) => ({ ...i, values: valuesByIdea[i.id] ?? {} }));

    return NextResponse.json({ success: true, data: { ideas: data, fields, statuses, views } });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }, req) => {
    const parsed = createIdeaSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    try {
      // Row + key allocation are transactional; custom-field values are written
      // after commit (mirrors the issues flow) so the Score recompute reads the
      // persisted inputs.
      const idea = await db.$transaction(async (tx) => {
        const project = await tx.qtProject.findUniqueOrThrow({
          where: { id: projectId },
          select: { projectKey: true },
        });

        // Default to the first funnel status when the caller doesn't pick one.
        const statusId =
          parsed.data.statusId ??
          (
            await tx.qtIdeaStatus.findFirst({
              where: { projectId, isDeleted: false, isHidden: false },
              orderBy: { orderIndex: "asc" },
              select: { id: true },
            })
          )?.id;
        if (!statusId) throw new Error("Project has no idea statuses");

        const seq = await tx.qtIdea.count({ where: { projectId } });
        return tx.qtIdea.create({
          data: {
            orgId,
            projectId,
            key: `${project.projectKey}-${seq + 1}`,
            title: parsed.data.title,
            description: parsed.data.description ?? null,
            statusId,
            reporterId: userId,
            assigneeId: parsed.data.assigneeId ?? null,
            orderIndex: seq,
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true, key: true, title: true, statusId: true },
        });
      });

      if (parsed.data.values && Object.keys(parsed.data.values).length > 0) {
        const res = await writeIdeaValues({
          orgId, ideaId: idea.id, projectId, actorId: userId,
          values: parsed.data.values, enforceRequired: true,
        });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: res.errors.join(", ") }, { status: 400 });
        }
      }

      return NextResponse.json({ success: true, data: idea }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create idea";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "create" } },
);
