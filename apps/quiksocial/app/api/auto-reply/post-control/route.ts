/**
 * /api/auto-reply/post-control — per-post auto-reply toggle.
 *
 * GET ?postId=<cuid>  → { autoReplyEnabled }. Defaults to true when no row exists.
 * POST { postId, autoReplyEnabled } → upserts on (orgId, postId).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { UpsertPostControlSchema } from "@/lib/auto-reply/types";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId");
  const postIdsParam = searchParams.get("postIds");

  // Bulk variant — used by the Auto-Reply Post Controls tab so we
  // don't fire 50 round-trips to enrich one tab's post list. Returns
  // a map keyed by postId; missing entries default to `true` on the
  // caller side (the column default).
  if (postIdsParam) {
    const ids = postIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100); // sanity cap

    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: { controls: {} } });
    }

    const rows = await db.autoReplyPostControl.findMany({
      where: { orgId, postId: { in: ids } },
      select: { postId: true, autoReplyEnabled: true },
    });

    const controls: Record<string, boolean> = {};
    for (const r of rows) controls[r.postId] = r.autoReplyEnabled;
    return NextResponse.json({ success: true, data: { controls } });
  }

  if (!postId) {
    return NextResponse.json(
      { success: false, error: "postId or postIds is required" },
      { status: 422 },
    );
  }

  const row = await db.autoReplyPostControl.findFirst({
    where: { orgId, postId },
    select: { autoReplyEnabled: true },
  });

  // Sensible default — absence means auto-reply is allowed.
  return NextResponse.json({
    success: true,
    data: { autoReplyEnabled: row?.autoReplyEnabled ?? true },
  });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = UpsertPostControlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload" },
      { status: 422 },
    );
  }
  const { postId, autoReplyEnabled } = parsed.data;

  const post = await db.post.findFirst({
    where: { id: postId, orgId },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json(
      { success: false, error: "Post not found in org" },
      { status: 404 },
    );
  }

  // The Post.findFirst above already enforces org scoping for this postId
  // (a Post belongs to exactly one org), so it's safe to upsert on
  // `postId` alone — the @unique constraint guarantees one row per post.
  const row = await db.autoReplyPostControl.upsert({
    where: { postId },
    create: {
      orgId,
      postId,
      autoReplyEnabled,
      updatedBy: userId ?? null,
    },
    update: { autoReplyEnabled, updatedBy: userId ?? null },
  });

  return NextResponse.json(
    { success: true, data: { postControl: row } },
    { status: 201 },
  );
});
