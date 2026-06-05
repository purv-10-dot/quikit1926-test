/**
 * PATCH /api/internal/auto-reply/log/[id] — finalize a reserved log row.
 *
 * Called by the responder after the Graph POST returns (success or failure).
 * Flips the row from PENDING to SENT / FAILED / SKIPPED with reply metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import { FinalizeLogSchema } from "@/lib/auto-reply/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = FinalizeLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const patch = parsed.data;

  const existing = await db.autoReplyLog.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await db.autoReplyLog.update({
    where: { id: params.id },
    data: {
      status: patch.status,
      platformReplyId: patch.platformReplyId ?? null,
      failureReason: patch.failureReason ?? null,
      latencyMs: patch.latencyMs ?? null,
      providerUsed: patch.providerUsed ?? null,
      // Phase 2 — null for template replies (no provider call). Float USD,
      // observability only. See FinalizeLogSchema in lib/auto-reply/types.ts.
      costUsd: patch.costUsd ?? null,
      ...(patch.replyText !== undefined ? { replyText: patch.replyText } : {}),
      sentAt: new Date(),
    },
  });

  return NextResponse.json({ log: row });
}
