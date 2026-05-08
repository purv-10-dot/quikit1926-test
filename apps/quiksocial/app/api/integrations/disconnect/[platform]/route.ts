/**
 * DELETE /api/integrations/disconnect/[platform]
 *
 * Soft-disconnects every active SocialAccount for the caller on this
 * platform (optionally scoped to a brand). Tokens are kept on the row so
 * re-connect can resume; the `isActive: false` flip is what stops publishes
 * from picking the account.
 *
 * Ported to QuikIT (Phase 3, Batch 3).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

const disconnectBodySchema = z.object({ brandId: z.string().optional() });

export const DELETE = withOrgAuth<{ platform: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const { platform } = params;
    const json = await req.json().catch(() => ({}));
    const body = disconnectBodySchema.parse(json ?? {});

    const where: Record<string, unknown> = { orgId, userId, platform };
    if (body.brandId) where.brandId = body.brandId;

    const result = await db.socialAccount.updateMany({
      where,
      data: { isActive: false, updatedBy: userId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { disconnected: result.count } });
  },
);
