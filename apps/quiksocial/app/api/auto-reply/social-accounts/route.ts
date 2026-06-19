/**
 * GET /api/auto-reply/social-accounts?brandId=<cuid>
 *
 * Wizard-dedicated endpoint that returns FB/IG SocialAccount rows in the
 * shape the rule-creation wizard needs (array with `id` + `isActive` so
 * the wizard can POST a valid `socialAccountId` on the new rule).
 *
 * The existing /api/integrations endpoint returns a platform-keyed map
 * without `id` — its consumer (the integrations dashboard page) relies on
 * that shape, so we don't reshape it. This endpoint is a thin, separate
 * read that serves the wizard's contract exactly.
 *
 * Org + user scoping match /api/integrations: a SocialAccount is
 * visible to the user who connected it within their org.
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const brandId = new URL(req.url).searchParams.get("brandId");

  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 422 },
    );
  }

  const accounts = await db.socialAccount.findMany({
    where: {
      orgId,
      userId,
      brandId,
      isActive: true,
      // Phase 1 auto-reply ships FB + IG only. Other platforms get filtered
      // here so the wizard never lists an account it can't actually use.
      platform: { in: ["facebook", "instagram"] },
    },
    select: {
      id: true,
      platform: true,
      accountName: true,
      accountId: true,
      pageId: true,
      isActive: true,
      // Phase 2 — platform-level master switch. Surfaced to the UI so
      // PlatformToggleStrip can render + flip the per-account toggle.
      autoReplyEnabled: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: { accounts } });
});
