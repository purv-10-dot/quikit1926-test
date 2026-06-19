/**
 * GET /api/integrations?brandId=X
 *
 * Returns all connected social accounts for the current user (optionally
 * scoped to a brand) as a platform→account map.
 *
 * Ported to QuikIT (Phase 3, Batch 3):
 *   - withOrgAuth wrapper
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");

  const where: Record<string, unknown> = {
    orgId,
    userId,
    isActive: true,
  };
  if (brandId) where.brandId = brandId;

  const accounts = await db.socialAccount.findMany({
    where,
    select: {
      platform: true,
      accountId: true,
      accountName: true,
      profilePicture: true,
      pageId: true,
      createdAt: true,
    },
    take: 50,
  });

  const connected: Record<
    string,
    {
      accountId: string;
      accountName: string;
      profilePicture?: string;
      pageId?: string;
    }
  > = {};
  for (const acc of accounts) {
    connected[acc.platform] = {
      accountId: acc.accountId,
      accountName: acc.accountName,
      profilePicture: acc.profilePicture ?? undefined,
      pageId: acc.pageId ?? undefined,
    };
  }

  return NextResponse.json({ success: true, data: { connected } });
});
