import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/** Remove an idea attachment (metadata row). Gated on Idea:update. */
export const DELETE = withProjectAccess<{ id: string; ideaId: string; attachmentId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    const idea = await db.qtIdea.findFirst({ where: { id: params.ideaId, orgId, projectId, isDeleted: false }, select: { id: true } });
    if (!idea) return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    const att = await db.qtIdeaAttachment.findFirst({ where: { id: params.attachmentId, orgId, ideaId: params.ideaId }, select: { id: true } });
    if (!att) return NextResponse.json({ success: false, error: "Attachment not found" }, { status: 404 });
    await db.qtIdeaAttachment.delete({ where: { id: params.attachmentId } });
    return NextResponse.json({ success: true, data: { id: params.attachmentId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
