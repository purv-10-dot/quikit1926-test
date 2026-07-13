import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject, hasAdminAccess } from "@/lib/api/permissions";
import { getDefaultStatusId } from "@/lib/services/projectDefaults";

/**
 * Create a NEW work item (QtIssue) in a chosen space and link it as delivery for
 * this idea (JPD Delivery "Create work item"). The target space may differ from
 * the idea's project (cross-project). Caller needs Issue:create in that space.
 */

const createSchema = z.object({
  spaceId: z.string().min(1),
  type: z.string().min(1).default("TASK"),
  summary: z.string().min(1, "Summary is required").max(255),
  embedIdea: z.boolean().optional(),
});

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { spaceId, type, summary, embedIdea } = parsed.data;

    const idea = await db.qtIdea.findFirst({
      where: { id: params.ideaId, orgId, projectId, isDeleted: false },
      select: { id: true, key: true, title: true, description: true },
    });
    if (!idea) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }

    const space = await db.qtProject.findFirst({
      where: { id: spaceId, orgId, isDeleted: false },
      select: { id: true, projectKey: true },
    });
    if (!space) {
      return NextResponse.json({ success: false, error: "Space not found" }, { status: 404 });
    }
    const isAdmin = await hasAdminAccess(userId, orgId);
    if (!isAdmin && !(await userCanInProject(userId, orgId, spaceId, "Issue", "create"))) {
      return NextResponse.json({ success: false, error: "You can't create work items in that space" }, { status: 403 });
    }

    // Optionally embed the idea's description + a back-reference into the issue.
    const description = embedIdea
      ? `<p><em>From idea ${idea.key}: ${idea.title}</em></p>${idea.description ?? ""}`
      : null;

    try {
      const issue = await db.$transaction(async (tx) => {
        const statusId = await getDefaultStatusId(tx, spaceId);
        if (!statusId) throw new Error("Target space has no statuses");
        const seq = await tx.qtIssue.count({ where: { projectId: spaceId } });
        const created = await tx.qtIssue.create({
          data: {
            orgId,
            projectId: spaceId,
            key: `${space.projectKey}-${seq + 1}`,
            title: summary,
            description,
            type,
            statusId,
            reporterId: userId,
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        });
        await tx.qtIdeaDelivery.create({
          data: { orgId, ideaId: idea.id, issueId: created.id, createdBy: userId },
        });
        return created;
      });
      return NextResponse.json({ success: true, data: { issueId: issue.id } }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create work item";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
