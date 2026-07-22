import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/** Remove a linked work item from an idea. Gated on Idea:update. */
export const DELETE = withProjectAccess<{ id: string; ideaId: string; linkId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    const idea = await db.qtIdea.findFirst({ where: { id: params.ideaId, orgId, projectId, isDeleted: false }, select: { id: true } });
    if (!idea) return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    const link = await db.qtIdeaLink.findFirst({ where: { id: params.linkId, orgId, ideaId: params.ideaId }, select: { id: true } });
    if (!link) return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    await db.qtIdeaLink.delete({ where: { id: params.linkId } });
    return NextResponse.json({ success: true, data: { id: params.linkId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
