/**
 * /api/auto-reply/rules — GET list, POST create.
 *
 * Session-authenticated user-facing CRUD. Org-scoped via withOrgAuth;
 * all queries include `orgId` in the where clause.
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { CreateRuleSchema } from "@/lib/auto-reply/types";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const socialAccountId = searchParams.get("socialAccountId");
  const isActiveParam = searchParams.get("isActive");

  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 422 },
    );
  }

  const rules = await db.autoReplyRule.findMany({
    where: {
      orgId,
      brandId,
      ...(socialAccountId ? { socialAccountId } : {}),
      ...(isActiveParam !== null ? { isActive: isActiveParam === "true" } : {}),
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ success: true, data: { rules } });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = CreateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload" },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // Verify brand + socialAccount both belong to this org before insert.
  const [brand, socialAccount] = await Promise.all([
    db.brand.findFirst({ where: { id: input.brandId, orgId }, select: { id: true } }),
    db.socialAccount.findFirst({
      where: { id: input.socialAccountId, orgId },
      select: { id: true },
    }),
  ]);
  if (!brand) {
    return NextResponse.json(
      { success: false, error: "Brand not found in org" },
      { status: 404 },
    );
  }
  if (!socialAccount) {
    return NextResponse.json(
      { success: false, error: "SocialAccount not found in org" },
      { status: 404 },
    );
  }

  const rule = await db.autoReplyRule.create({
    data: {
      orgId,
      brandId: input.brandId,
      socialAccountId: input.socialAccountId,
      name: input.name,
      triggerType: input.triggerType,
      replyMode: input.replyMode,
      isActive: input.isActive,
      priority: input.priority,
      templateBody: input.replyMode === "TEMPLATE" ? input.templateBody ?? null : null,
      keywords: input.triggerType === "KEYWORD_MATCH" ? input.keywords : [],
      keywordMatch: input.keywordMatch,
      caseSensitive: input.caseSensitive,
      toneGuidance: input.replyMode === "AI" ? input.toneGuidance ?? null : null,
      cooldownMinutes: input.cooldownMinutes,
      maxRepliesPerDay: input.maxRepliesPerDay,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    },
  });

  return NextResponse.json({ success: true, data: { rule } }, { status: 201 });
});
