/**
 * /api/posts/[id]
 *
 * DELETE — Admin/approver: any post in the brand. Member: only their own
 *          posts in "draft" status.
 *
 * PATCH  — Admin/approver: edits caption (`content`) and/or aiImageUrl on
 *          any post. Member: same fields, own posts, "draft" status only.
 *          Other fields are deliberately rejected — dedicated /approve,
 *          /reject, /submit-review, /withdraw, /status routes own status
 *          transitions.
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { getWorkspaceRole } from "@/lib/auth/rbac";

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

const patchPostSchema = z.object({
  content: z.string().optional(),
  aiImageUrl: z.string().optional(),
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/[id]
// ---------------------------------------------------------------------------
export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, status: true, createdBy: true },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found", code: "POST_NOT_FOUND" },
        { status: 404 },
      );
    }

    const role = await getWorkspaceRole(orgId, userId, post.brandId);
    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have access to this brand",
          code: "NO_BRAND_ACCESS",
        },
        { status: 403 },
      );
    }
    const isAdmin = role === "admin" || role === "approver";

    if (!isAdmin) {
      if (post.createdBy !== userId) {
        return NextResponse.json(
          {
            success: false,
            error: "You can only delete your own posts",
            code: "NOT_POST_OWNER",
          },
          { status: 403 },
        );
      }
      if (post.status !== "draft") {
        return NextResponse.json(
          {
            success: false,
            error: "Members can only delete posts in draft status",
            code: "INVALID_STATUS_FOR_DELETE",
          },
          { status: 422 },
        );
      }
    }

    await db.post.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, data: null });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/posts/[id]
// ---------------------------------------------------------------------------
export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = patchPostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_BODY" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const updateFields: Record<string, unknown> = {};
    if (typeof body.content === "string") updateFields.content = body.content;
    if (typeof body.aiImageUrl === "string" && body.aiImageUrl.trim()) {
      updateFields.aiImageUrl = body.aiImageUrl.trim();
    }
    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No editable fields provided",
          code: "NO_FIELDS",
        },
        { status: 400 },
      );
    }

    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, status: true, createdBy: true },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found", code: "POST_NOT_FOUND" },
        { status: 404 },
      );
    }

    const role = await getWorkspaceRole(orgId, userId, post.brandId);
    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have access to this brand",
          code: "NO_BRAND_ACCESS",
        },
        { status: 403 },
      );
    }
    const isAdmin = role === "admin" || role === "approver";

    if (!isAdmin) {
      if (post.createdBy !== userId) {
        return NextResponse.json(
          {
            success: false,
            error: "You can only edit your own posts",
            code: "NOT_POST_OWNER",
          },
          { status: 403 },
        );
      }
      if (post.status !== "draft") {
        return NextResponse.json(
          {
            success: false,
            error: "Members can only edit posts in draft status",
            code: "INVALID_STATUS_FOR_EDIT",
          },
          { status: 422 },
        );
      }
    }

    updateFields.updatedBy = userId;

    const updated = await db.post.update({
      where: { id: params.id },
      data: updateFields,
    });

    return NextResponse.json({
      success: true,
      data: { post: aliasPost(updated) },
    });
  },
);
