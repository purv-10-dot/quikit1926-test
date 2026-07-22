import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Unlink a delivery work item from an idea (removes the link row only — the
 * QtIssue itself is untouched). Gated on Idea:update.
 */

export const DELETE = withProjectAccess<{ id: string; ideaId: string; linkId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    const link = await db.qtIdeaDelivery.findFirst({
      where: { id: params.linkId, orgId, ideaId: params.ideaId, idea: { projectId } },
      select: { id: true },
    });
    if (!link) {
      return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    }
    await db.qtIdeaDelivery.delete({ where: { id: params.linkId } });
    return NextResponse.json({ success: true, data: { id: params.linkId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
