import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * View-level comments (JPD "All ideas" About/Comments drawer). GET lists them,
 * POST adds one. Reading is membership-gated (IdeaView:view); posting reuses
 * IdeaView:view too (any member can comment on a view).
 */

const createSchema = z.object({ body: z.string().min(1, "Comment can't be empty").max(20000) });

async function viewExists(orgId: string, projectId: string, viewId: string) {
  return db.qtIdeaView.findFirst({
    where: { id: viewId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
}

export const GET = withProjectAccess<{ id: string; viewId: string }>(
  async ({ orgId, projectId }, _req, { params }) => {
    if (!(await viewExists(orgId, projectId, params.viewId))) {
      return NextResponse.json({ success: false, error: "View not found" }, { status: 404 });
    }
    const comments = await db.qtIdeaViewComment.findMany({
      where: { orgId, viewId: params.viewId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, createdBy: true, createdAt: true, updatedAt: true },
    });
    const authorIds = [...new Set(comments.map((c) => c.createdBy).filter((v): v is string => Boolean(v)))];
    const users = authorIds.length
      ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = comments.map((c) => {
      const u = c.createdBy ? byId.get(c.createdBy) : null;
      const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "Unknown";
      return { ...c, authorName: name };
    });
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; viewId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (!(await viewExists(orgId, projectId, params.viewId))) {
      return NextResponse.json({ success: false, error: "View not found" }, { status: 404 });
    }
    try {
      const comment = await db.qtIdeaViewComment.create({
        data: { orgId, viewId: params.viewId, body: parsed.data.body, createdBy: userId },
        select: { id: true, body: true, createdBy: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json({ success: true, data: comment }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add comment";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);
