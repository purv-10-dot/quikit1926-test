import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import {
  buildTemplateFromRows,
  isWorkflowTemplate,
  classicWorkflowTemplate,
  CLASSIC_TEMPLATE_ID,
  type TransitionType,
} from "@/lib/services/workflow";

/**
 * GET /api/workflows
 * List the org's reusable workflow templates (projectId = null). Used by the
 * "Add Existing Workflow" picker: name, description, updatedAt + the name-based
 * template graph for the read-only preview.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  const templates = await db.qtWorkflow.findMany({
    where: { orgId, projectId: null, isDeleted: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, updatedAt: true, templateJson: true },
  });
  const classic = classicWorkflowTemplate();
  return NextResponse.json({
    success: true,
    data: [
      // The built-in classic default workflow is always offered first.
      {
        id: CLASSIC_TEMPLATE_ID,
        name: "Classic default workflow",
        description: classic.description,
        updatedAt: new Date(0),
        template: classic,
        builtIn: true,
      },
      ...templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        updatedAt: t.updatedAt,
        template: isWorkflowTemplate(t.templateJson) ? t.templateJson : null,
        builtIn: false,
      })),
    ],
  });
});

const createSchema = z.object({
  /** Source workflow to snapshot into a reusable template. */
  sourceWorkflowId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

/**
 * POST /api/workflows
 * "Save as new workflow": snapshot an existing (project) workflow's current
 * graph into a NEW org-level template (projectId = null, inactive), with a
 * self-contained name-based `templateJson` so it survives independently of the
 * source project.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { sourceWorkflowId, name, description } = parsed.data;

  const source = await db.qtWorkflow.findFirst({
    where: { id: sourceWorkflowId, orgId, isDeleted: false },
    select: {
      projectId: true,
      workflowStatuses: {
        select: {
          statusId: true,
          isInitial: true,
          status: { select: { name: true, category: true, color: true } },
        },
      },
      transitions: {
        where: { isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: {
          name: true,
          type: true,
          toStatusId: true,
          fromStatuses: { select: { statusId: true } },
          rules: {
            select: { kind: true, type: true, config: true, errorMessage: true, groupNo: true, orderNo: true },
          },
        },
      },
    },
  });
  if (!source) {
    return NextResponse.json({ success: false, error: "Source workflow not found." }, { status: 404 });
  }
  // Admin, or Project:update in the source workflow's project.
  const canSave =
    (await hasAdminAccess(userId, orgId)) ||
    (!!source.projectId &&
      (await userCanInProject(userId, orgId, source.projectId, "Project", "update")));
  if (!canSave) {
    return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  }

  // Build the name-based snapshot from the source rows.
  const statusMeta = new Map<string, { name: string; category: string; color: string }>();
  for (const n of source.workflowStatuses) {
    statusMeta.set(n.statusId, { name: n.status.name, category: n.status.category, color: n.status.color });
  }
  const template = buildTemplateFromRows({
    description: description ?? null,
    workflowStatuses: source.workflowStatuses.map((n) => ({ statusId: n.statusId, isInitial: n.isInitial })),
    transitions: source.transitions.map((t) => ({
      name: t.name,
      type: t.type as TransitionType,
      toStatusId: t.toStatusId,
      fromStatusIds: t.fromStatuses.map((f) => f.statusId),
      rules: t.rules.map((r) => ({
        kind: r.kind as "CONDITION" | "VALIDATOR" | "POSTFUNCTION",
        type: r.type,
        config: (r.config ?? {}) as Record<string, unknown>,
        errorMessage: r.errorMessage,
        groupNo: r.groupNo,
        orderNo: r.orderNo,
      })),
    })),
    statusMeta,
  });

  // Uniqueness within (org, null project): reject a duplicate template name.
  const dupe = await db.qtWorkflow.findFirst({
    where: { orgId, projectId: null, name, isDeleted: false },
    select: { id: true },
  });
  if (dupe) {
    return NextResponse.json(
      { success: false, error: "A workflow with this name already exists." },
      { status: 400 },
    );
  }

  const created = await db.qtWorkflow.create({
    data: {
      orgId,
      projectId: null,
      name,
      description: description ?? null,
      isActive: false,
      createdBy: userId,
      templateJson: template as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, name: true },
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
