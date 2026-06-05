/**
 * /api/posts — GET list (paginated), POST create.
 *
 * Ported to QuikIT (Phase 3, Batch 2):
 *   - withOrgAuth wrapper
 *   - orgId from session
 *   - { success, data } envelope
 *   - Zod input validation
 *   - _id + userId aliases preserved (frontend compat)
 *
 * RBAC: admin/approver see every post in the brand. Members see only
 * their own posts.
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

const createPostSchema = z.object({
  brandId: z.string().min(1),
  content: z.string().min(1),
  platform: z.string().min(1),
  campaignId: z.string().nullish(),
  scheduledFor: z.string().nullish(),
  imageUrl: z.string().nullish(),
  prompt: z.string().nullish(),
  attachedOffering: z.unknown().optional(),
  // Legacy aliases — fold into attachedOffering if attachedOffering itself
  // wasn't supplied. Drop these once every client ships the unified shape.
  attachedProduct: z.unknown().optional(),
  attachedService: z.unknown().optional(),
  attachedAsset: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/posts?brandId=X&status=&startDate=&endDate=&page=N
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const status = searchParams.get("status");

  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(orgId, userId, brandId);
  if (!role) {
    return NextResponse.json(
      { success: false, error: "No access to this brand" },
      { status: 403 },
    );
  }
  const isAdmin = role === "admin" || role === "approver";

  const where: Record<string, unknown> = { orgId, brandId };
  if (!isAdmin) where.createdBy = userId;
  if (status && status !== "all") where.status = status;

  if (startDate || endDate) {
    const range: { gte?: Date; lte?: Date } = {};
    if (startDate) range.gte = new Date(startDate);
    if (endDate) range.lte = new Date(endDate);
    // A post appears on the calendar by its most relevant date:
    //   scheduledFor  → scheduled / overdue
    //   publishedAt   → published (these carry NO scheduledFor, so the old
    //                   scheduledFor-only filter silently dropped them)
    //   createdAt     → drafts / approved with no date set yet
    // The calendar is the only caller that passes startDate/endDate, so
    // broadening this filter doesn't affect Content Hub / Campaigns / etc.
    where.OR = [
      { scheduledFor: range },
      { publishedAt: range },
      { scheduledFor: null, publishedAt: null, createdAt: range },
    ];
  }

  const PAGE_SIZE = 12;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.post.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      posts: rows.map(aliasPost),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasMore: skip + rows.length < total,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/posts — create a post
// Members create as draft. Admins + scheduledFor → scheduled (auto-stamps approvedAt).
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createPostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const role = await getWorkspaceRole(orgId, userId, body.brandId);
  if (!role) {
    return NextResponse.json(
      { success: false, error: "No access to this brand" },
      { status: 403 },
    );
  }
  const isAdmin = role === "admin" || role === "approver";

  const requestedSchedule = body.scheduledFor ? new Date(body.scheduledFor) : null;

  let status = "draft";
  let persistedScheduledFor: Date | null = null;
  // Admin-created scheduled posts must carry an approvedAt stamp — the
  // cron's publish loop trusts status='scheduled' as the approval signal.
  let approvedAt: Date | null = null;
  if (isAdmin && requestedSchedule) {
    status = "scheduled";
    persistedScheduledFor = requestedSchedule;
    approvedAt = new Date();
  }

  const created = await db.post.create({
    data: {
      orgId,
      brandId: body.brandId,
      createdBy: userId,
      campaignId: body.campaignId ?? null,
      content: body.content,
      platform: body.platform,
      status,
      approvedAt,
      aiImageUrl: body.imageUrl ?? null,
      imageUrls: body.imageUrl ? [body.imageUrl] : [],
      isAiGenerated: true,
      scheduledFor: persistedScheduledFor,
      prompt:
        typeof body.prompt === "string" && body.prompt.trim()
          ? body.prompt.trim()
          : null,
      attachedOffering: ((body.attachedOffering ??
        body.attachedProduct ??
        body.attachedService ??
        undefined) as never),
      attachedAsset: (body.attachedAsset ?? undefined) as never,
    },
  });

  return NextResponse.json(
    { success: true, data: { post: aliasPost(created) } },
    { status: 201 },
  );
});
