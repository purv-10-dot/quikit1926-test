import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Update a discovery idea VIEW's saved config — currently the visible column set
 * ("Save for everyone"). Gated on Project:update (Space Admin / project admin;
 * org+app admins bypass), so ordinary members can tweak columns locally but only
 * admins persist the shared view.
 */

const patchViewSchema = z.object({
  columns: z.array(z.string().min(1)).min(1).max(50),
});

export const PATCH = withProjectAccess<{ id: string; viewId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = patchViewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const view = await db.qtIdeaView.findFirst({
      where: { id: params.viewId, orgId, projectId, isDeleted: false },
      select: { id: true, config: true },
    });
    if (!view) {
      return NextResponse.json({ success: false, error: "View not found" }, { status: 404 });
    }

    const config = { ...(view.config as Record<string, unknown> | null ?? {}), columns: parsed.data.columns };
    const updated = await db.qtIdeaView.update({
      where: { id: params.viewId },
      data: { config, updatedBy: userId },
      select: { id: true, config: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
