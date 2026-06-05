/**
 * PATCH /api/auto-reply/rules/[id]/toggle — toggle isActive.
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ToggleRuleSchema } from "@/lib/auto-reply/types";

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const body = await req.json().catch(() => null);
    const parsed = ToggleRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
        { status: 422 },
      );
    }

    const existing = await db.autoReplyRule.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const rule = await db.autoReplyRule.update({
      where: { id: params.id },
      data: { isActive: parsed.data.isActive, updatedBy: userId ?? null },
    });

    return NextResponse.json({ success: true, data: { rule } });
  },
);
