import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { forbidden, userCanInProject } from "@/lib/api/permissions";
import {
  DuplicateTemplateNameError,
  captureSpaceConfig,
  saveSpaceTemplate,
  summarizeTemplate,
} from "@/lib/services/spaceTemplates";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
});

/**
 * POST /api/projects/:id/save-as-template — snapshot this space's configuration
 * (issue types, statuses + board columns, custom fields, project roles and their
 * grants, sprint settings, tab layout, background) into a reusable, org-scoped
 * template.
 *
 * Configuration only — no issues, sprints, comments, attachments or members are
 * copied. Gated on Project:update: reading a space's config is a member-level
 * act, but publishing it org-wide as a template is an administrative one.
 */
export const POST = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, req) => {
    try {
      if (
        !isTenantAdmin &&
        !(await userCanInProject(userId, orgId, projectId, "Project", "update"))
      ) {
        return forbidden("You don't have permission to save this space as a template.");
      }

      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
          { status: 400 },
        );
      }

      const config = await captureSpaceConfig(orgId, projectId);
      if (!config) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }

      const project = await db.qtProject.findFirst({
        where: { id: projectId, orgId, isDeleted: false },
        select: { icon: true, color: true },
      });

      const saved = await saveSpaceTemplate({
        orgId,
        userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        sourceProjectId: projectId,
        templateKey: config.space.templateKey,
        icon: project?.icon ?? null,
        color: project?.color ?? null,
        config,
      });

      return NextResponse.json(
        { success: true, data: { ...saved, summary: summarizeTemplate(config) } },
        { status: 201 },
      );
    } catch (error: unknown) {
      if (error instanceof DuplicateTemplateNameError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 409 });
      }
      const message = error instanceof Error ? error.message : "Failed to save template";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
