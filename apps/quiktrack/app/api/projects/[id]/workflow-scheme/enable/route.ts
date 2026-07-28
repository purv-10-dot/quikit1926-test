import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { seedProjectWorkflow } from "@/lib/services/projectDefaults";

/**
 * POST /api/projects/[id]/workflow-scheme/enable
 * Opt an EXISTING space into workflows: provision a published "classic default
 * workflow" + scheme (over the space's current statuses) and seed the org's
 * resolution catalog. Reuses the same seeder that runs on new-space creation,
 * so new and existing spaces end up identical. Idempotent — no-ops if a scheme
 * already exists.
 *
 * Admin-gated (Project:update), same as the rest of the workflow config API.
 */
export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId, userId }) => {
    const existing = await db.qtWorkflowScheme.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, data: { alreadyEnabled: true } });
    }

    await db.$transaction((tx) => seedProjectWorkflow(tx, projectId, orgId, userId));

    return NextResponse.json({ success: true, data: { enabled: true } }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
