/**
 * POST /api/internal/auto-reply/cursor — upsert per-post cursor.
 *
 * Called by the Python monitor after each post's polling round.
 * Advances lastCommentTimestamp to the highest comment timestamp seen,
 * or records an error on the cursor without advancing.
 *
 * Accepts both `orgId` (canonical) and `tenantId` (legacy wire-format
 * from the Python service) in the request body. Routes resolve to a
 * single `orgId` before hitting Prisma.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import { UpsertCursorSchema, resolveOrgId } from "@/lib/auto-reply/types";

export async function POST(req: NextRequest) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = UpsertCursorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const orgId = resolveOrgId(input);
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 422 },
    );
  }

  const row = await db.autoReplyCursor.upsert({
    where: {
      orgId_socialAccountId_postId: {
        orgId,
        socialAccountId: input.socialAccountId,
        postId: input.postId,
      },
    },
    create: {
      orgId,
      socialAccountId: input.socialAccountId,
      postId: input.postId,
      platformPostId: input.platformPostId,
      lastPolledAt: new Date(input.lastPolledAt),
      lastCommentTimestamp: input.lastCommentTimestamp
        ? new Date(input.lastCommentTimestamp)
        : null,
      consecutiveErrors: input.consecutiveErrors,
      lastPollError: input.lastPollError ?? null,
    },
    update: {
      platformPostId: input.platformPostId,
      lastPolledAt: new Date(input.lastPolledAt),
      ...(input.lastCommentTimestamp
        ? { lastCommentTimestamp: new Date(input.lastCommentTimestamp) }
        : {}),
      consecutiveErrors: input.consecutiveErrors,
      lastPollError: input.lastPollError ?? null,
    },
  });

  return NextResponse.json({ cursor: row });
}
