/**
 * PATCH /api/auto-reply/platform-toggle
 *
 * Phase 2 — flips SocialAccount.autoReplyEnabled. Session-authenticated
 * + org-scoped.
 *
 * When toggling from false → true, advances every AutoReplyCursor row
 * for this socialAccountId to lastCommentTimestamp = now() in the same
 * transaction. Per Phase 2 Q5: comments that arrived while the platform
 * was disabled are NOT retroactively processed — the monitor's
 * cursor-skip check filters them out on the very next tick.
 *
 * Disable → enable behaviour: no cursor changes needed (the monitor
 * just returns early when reading platformDisabled=true).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { PlatformToggleSchema } from "@/lib/auto-reply/types";

export const PATCH = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = PlatformToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload" },
      { status: 422 },
    );
  }
  const { socialAccountId, autoReplyEnabled } = parsed.data;

  // Confirm the SocialAccount belongs to this org before mutating.
  // findFirst rather than findUnique because the unique key is composite
  // (orgId, userId, platform, accountId) — id alone IS unique, but
  // org scoping is the safety belt.
  const existing = await db.socialAccount.findFirst({
    where: { id: socialAccountId, orgId },
    select: { id: true, autoReplyEnabled: true },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "SocialAccount not found in org" },
      { status: 404 },
    );
  }

  const wasDisabled = !existing.autoReplyEnabled;
  const willEnable = autoReplyEnabled === true;
  const advanceCursors = wasDisabled && willEnable;

  // Atomic update — both writes succeed or roll back together. Without
  // the transaction a partial state could let the monitor see the new
  // enabled flag while still reading old cursors, retroactively replying
  // to comments that arrived while disabled.
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.socialAccount.update({
      where: { id: socialAccountId },
      data: { autoReplyEnabled },
      select: { id: true, autoReplyEnabled: true },
    });

    let cursorsAdvanced = 0;
    if (advanceCursors) {
      const now = new Date();
      const cursorUpdate = await tx.autoReplyCursor.updateMany({
        where: { orgId, socialAccountId },
        data: { lastCommentTimestamp: now, lastPolledAt: now },
      });
      cursorsAdvanced = cursorUpdate.count;
    }

    return { updated, cursorsAdvanced };
  });

  return NextResponse.json({
    success: true,
    data: {
      socialAccount: result.updated,
      cursorsAdvanced: result.cursorsAdvanced,
    },
  });
});
