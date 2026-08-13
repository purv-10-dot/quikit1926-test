import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  isWorkflowTemplate,
  materializeTemplateIntoProject,
  classicWorkflowTemplate,
  CLASSIC_TEMPLATE_ID,
  type WorkflowTemplate,
} from "@/lib/services/workflow";

/**
 * POST /api/projects/[id]/workflow-scheme/add-existing
 * "Add Existing Workflow": materialize a reusable org template into THIS project
 * as an unpublished draft. Statuses are created-or-reused BY NAME, the workflow's
 * nodes/transitions are recreated with local status ids, and the scheme item is
 * pointed at the new workflow. The admin then Publishes (normal migration flow).
 *
 * Admin-gated (Project:update).
 */
const bodySchema = z.object({
  workflowId: z.string().min(1), // the org template to import
  name: z.string().min(1).max(120).optional(),
  issueTypeIds: z.array(z.string().min(1)).optional(),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId, userId }, req) => {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { workflowId, name, issueTypeIds } = parsed.data;

    // Resolve the template: the built-in classic, or a saved org template.
    let template: WorkflowTemplate;
    let templateName: string;
    if (workflowId === CLASSIC_TEMPLATE_ID) {
      template = classicWorkflowTemplate();
      templateName = "classic default workflow";
    } else {
      const tmpl = await db.qtWorkflow.findFirst({
        where: { id: workflowId, orgId, projectId: null, isDeleted: false },
        select: { name: true, templateJson: true },
      });
      if (!tmpl || !isWorkflowTemplate(tmpl.templateJson)) {
        return NextResponse.json(
          { success: false, error: "Template workflow not found." },
          { status: 404 },
        );
      }
      template = tmpl.templateJson as WorkflowTemplate;
      templateName = tmpl.name;
    }

    // Validate the requested issue types belong to this project.
    let typeIds: string[] = [];
    if (issueTypeIds && issueTypeIds.length > 0) {
      const valid = await db.qtIssueType.findMany({
        where: { projectId, id: { in: issueTypeIds }, isDeleted: false },
        select: { id: true },
      });
      typeIds = valid.map((t) => t.id);
      if (typeIds.length !== issueTypeIds.length) {
        return NextResponse.json(
          { success: false, error: "One or more issue types are not in this project." },
          { status: 400 },
        );
      }
    }

    const workflowName = name?.trim() || templateName;

    // A project can't have two workflows with the same name (unique
    // [orgId, projectId, name]). Guard up front so the admin gets a clear
    // message instead of a raw Prisma unique-constraint error.
    const existing = await db.qtWorkflow.findFirst({
      where: { orgId, projectId, name: workflowName, isDeleted: false },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `A workflow named "${workflowName}" already exists in this space. Rename or remove it first, or import under a different name.`,
        },
        { status: 409 },
      );
    }

    try {
      const newWorkflowId = await db.$transaction((tx) =>
        materializeTemplateIntoProject(tx, {
          template,
          projectId,
          orgId,
          workflowName,
          createdBy: userId,
          issueTypeIds: typeIds,
        }),
      );
      return NextResponse.json({ success: true, data: { workflowId: newWorkflowId } }, { status: 201 });
    } catch (error: unknown) {
      // Fallback for a race on the unique name (guard above already handles the
      // common case) — never surface the raw Prisma error.
      const message = error instanceof Error && error.message.includes("Unique constraint")
        ? `A workflow named "${workflowName}" already exists in this space.`
        : error instanceof Error ? error.message : "Failed to add the workflow.";
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
