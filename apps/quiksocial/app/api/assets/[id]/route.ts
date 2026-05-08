/**
 * /api/assets/[id] — DELETE soft-delete (isActive = false).
 *
 * Ported to QuikIT (Phase 3, Batch 1). Soft delete preserves historical
 * post references that point at the asset URL.
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const existing = await db.assetLibrary.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    await db.assetLibrary.update({
      where: { id: params.id },
      data: { isActive: false, updatedBy: userId },
    });

    return NextResponse.json({ success: true, data: null });
  },
);
