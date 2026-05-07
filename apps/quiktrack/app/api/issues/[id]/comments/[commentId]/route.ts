import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const updateCommentSchema = z.object({
  body: z.string().min(1).max(20_000),
});

export const PATCH = withOrgAuth<{ id: string; commentId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const comment = await db.qtIssueComment.findFirst({
      where: {
        id: params.commentId,
        orgId: orgId,
        issueId: params.id,
        isDeleted: false,
      },
      select: { id: true, userId: true },
    });
    if (!comment) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (comment.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = updateCommentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const updated = await db.qtIssueComment.update({
      where: { id: comment.id },
      data: { body: parsed.data.body, editedAt: new Date() },
      select: { id: true, body: true, editedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);

export const DELETE = withOrgAuth<{ id: string; commentId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const comment = await db.qtIssueComment.findFirst({
      where: {
        id: params.commentId,
        orgId: orgId,
        issueId: params.id,
        isDeleted: false,
      },
      select: { id: true, userId: true },
    });
    if (!comment) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (comment.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await db.qtIssueComment.update({
      where: { id: comment.id },
      data: { isDeleted: true },
    });
    return NextResponse.json({ success: true, data: { id: comment.id } });
  },
);
