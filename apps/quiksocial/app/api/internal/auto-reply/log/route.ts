/**
 * POST /api/internal/auto-reply/log — reserve a log row (Q7 pre-insert pattern).
 *
 * Inserts a PENDING row. The unique index on (socialAccountId, platformCommentId)
 * is the idempotency gate — if another responder already reserved this comment,
 * the insert raises P2002 and we return { reserved: false }.
 *
 * The responder MUST call this BEFORE the Graph POST; if reserved=false it
 * aborts without side effects. After a successful Graph POST it PATCHes
 * /api/internal/auto-reply/log/[id] to finalize the row.
 *
 * Accepts both `orgId` (canonical) and `tenantId` (legacy wire-format).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import { ReserveLogSchema, resolveOrgId } from "@/lib/auto-reply/types";

export async function POST(req: NextRequest) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = ReserveLogSchema.safeParse(body);
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

  try {
    const row = await db.autoReplyLog.create({
      data: {
        orgId,
        ruleId: input.ruleId,
        postId: input.postId,
        socialAccountId: input.socialAccountId,
        platformCommentId: input.platformCommentId,
        commentAuthor: input.commentAuthor ?? null,
        commentAuthorId: input.commentAuthorId ?? null,
        commentText: input.commentText ?? null,
        replyText: input.replyText ?? null,
        replyMode: input.replyMode,
        status: "PENDING",
      },
      select: { id: true },
    });
    return NextResponse.json({ reserved: true, id: row.id });
  } catch (err) {
    // P2002 = unique constraint violation on (socialAccountId, platformCommentId).
    // Another responder already reserved this comment. The caller aborts.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.autoReplyLog.findFirst({
        where: {
          socialAccountId: input.socialAccountId,
          platformCommentId: input.platformCommentId,
        },
        select: { id: true, status: true },
      });
      return NextResponse.json({
        reserved: false,
        id: existing?.id ?? null,
        existingStatus: existing?.status ?? null,
      });
    }
    throw err;
  }
}
