import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { listSpaceTemplates, summarizeTemplate } from "@/lib/services/spaceTemplates";

/**
 * GET /api/space-templates — the org's saved space templates, newest first.
 *
 * Gated on Project:create: the only thing you can do with a template is start a
 * new space from it, so anyone who can't create a space has no use for the list.
 * The heavy `config` snapshot is summarised rather than returned in full — the
 * picker only needs counts.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
    if (!(await userCan(userId, orgId, "Project", "create"))) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }
    const rows = await listSpaceTemplates(orgId);
    return NextResponse.json({
      success: true,
      data: rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        templateKey: t.templateKey,
        icon: t.icon,
        color: t.color,
        sourceProjectId: t.sourceProjectId,
        createdAt: t.createdAt,
        summary: summarizeTemplate(t.config),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load templates";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
