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
          assigneeId: true, reporterId: true, createdBy: true, archivedFlag: true, orderIndex: true,
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

    const ideaIds = ideas.map((i) => i.id);
    const valuesByIdea = await getValuesForIdeas(orgId, ideaIds);

    // Real per-idea counts for the Insights / Delivery / Comments grid columns.
    const [insightGroups, deliveryLinks, commentGroups] = ideaIds.length
      ? await Promise.all([
          db.qtIdeaInsight.groupBy({ by: ["ideaId"], where: { ideaId: { in: ideaIds }, isDeleted: false }, _count: { _all: true } }),
          // Links (idea → issueId). issueId has no FK (linked issues may live in
          // other projects), so we resolve statuses in a second query below.
          db.qtIdeaDelivery.findMany({ where: { ideaId: { in: ideaIds } }, select: { ideaId: true, issueId: true } }),
          db.qtIdeaComment.groupBy({ by: ["ideaId"], where: { ideaId: { in: ideaIds }, isDeleted: false }, _count: { _all: true } }),
        ])
      : [[], [], []];
    const insightCountByIdea = new Map(insightGroups.map((g) => [g.ideaId, g._count._all]));
    const commentCountByIdea = new Map(commentGroups.map((g) => [g.ideaId, g._count._all]));

    // Resolve the status category of every linked issue in one query, then roll up
    // per idea → the To Do / In Progress / Done pill counts (JPD "Delivery status").
    const linkedIssueIds = [...new Set(deliveryLinks.map((l) => l.issueId))];
    const issueCatById = new Map<string, string | null>();
    if (linkedIssueIds.length) {
      const issues = await db.qtIssue.findMany({
        where: { id: { in: linkedIssueIds }, isDeleted: false },
        select: { id: true, status: { select: { category: true } } },
      });
      for (const it of issues) issueCatById.set(it.id, it.status?.category ?? null);
    }
    type DelCounts = { total: number; todo: number; inProgress: number; done: number };
    const deliveryCountsByIdea = new Map<string, DelCounts>();
    for (const link of deliveryLinks) {
      const c = deliveryCountsByIdea.get(link.ideaId) ?? { total: 0, todo: 0, inProgress: 0, done: 0 };
      const cat = issueCatById.get(link.issueId);
      c.total += 1;
      if (cat === "DONE") c.done += 1;
      else if (cat === "IN_PROGRESS") c.inProgress += 1;
      else c.todo += 1;
      deliveryCountsByIdea.set(link.ideaId, c);
    }

    const data = ideas.map((i) => {
      const dc = deliveryCountsByIdea.get(i.id) ?? { total: 0, todo: 0, inProgress: 0, done: 0 };
      return {
        ...i,
        values: valuesByIdea[i.id] ?? {},
        insightCount: insightCountByIdea.get(i.id) ?? 0,
        deliveryCount: dc.total,
        deliveryCounts: dc,
        commentCount: commentCountByIdea.get(i.id) ?? 0,
      };
    });

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
