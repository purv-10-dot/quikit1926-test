/**
 * POST /api/scores/override — analyst overrides an AI score on a single
 * criterion. Justification is required when an override is set; sending
 * `analystScore: null` clears the override and falls back to the AI score.
 *
 * Recomputes the deal's composite from the latest analyst-or-AI score per
 * criterion (server-side weighted sum) so the Pipeline + Deal Overview
 * stay in sync.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

const bodySchema = z.object({
  dealId: z.string().min(1),
  criterionSlug: z.string().min(1),
  analystScore: z.number().int().min(0).max(100).nullable(),
  reason: z.string().max(2000).optional(),
});

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { dealId, criterionSlug, analystScore, reason } = parsed.data;

  // Setting an override requires a reason; clearing one does not.
  if (analystScore != null && !reason?.trim()) {
    return NextResponse.json(
      { success: false, error: "Justification required when overriding an AI score" },
      { status: 400 },
    );
  }

  const deal = await db.vCDeal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, verticalId: true },
  });
  if (!deal) {
    return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
  }

  await db.vCDealScore.upsert({
    where: {
      orgId_dealId_criterionSlug: { orgId, dealId, criterionSlug },
    },
    update: {
      analystScore,
      overrideReason: analystScore == null ? null : (reason ?? null),
      updatedBy: userId,
    },
    create: {
      orgId,
      dealId,
      criterionSlug,
      aiScore: null,
      analystScore,
      overrideReason: analystScore == null ? null : (reason ?? null),
      createdBy: userId,
      updatedBy: userId,
    },
  });

  // Recompute composite — analystScore wins per row, falls back to aiScore.
  const [scores, criteria] = await Promise.all([
    db.vCDealScore.findMany({
      where: { orgId, dealId },
      select: { criterionSlug: true, aiScore: true, analystScore: true },
    }),
    db.vCScoringCriterion.findMany({
      where: { orgId, verticalId: deal.verticalId },
      select: { slug: true, weight: true },
    }),
  ]);

  const slugToWeight = Object.fromEntries(criteria.map((c) => [c.slug, c.weight]));
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 100;

  let aiSum = 0;
  let analystSum = 0;
  let hasAnalystOverride = false;
  for (const s of scores) {
    const weight = slugToWeight[s.criterionSlug] ?? 0;
    if (s.aiScore != null) aiSum += (s.aiScore * weight) / totalWeight;
    if (s.analystScore != null) {
      analystSum += (s.analystScore * weight) / totalWeight;
      hasAnalystOverride = true;
    } else if (s.aiScore != null) {
      analystSum += (s.aiScore * weight) / totalWeight;
    }
  }

  await db.$transaction([
    db.vCDeal.update({
      where: { id: dealId },
      data: {
        aiScore: Math.round(aiSum) || null,
        analystScore: hasAnalystOverride ? Math.round(analystSum) : null,
        updatedBy: userId,
      },
    }),
    db.vCTimelineEvent.create({
      data: {
        orgId,
        dealId,
        type: "score-overridden",
        actorId: userId,
        summary:
          analystScore == null
            ? `Cleared analyst override on "${criterionSlug}"`
            : `Override "${criterionSlug}" → ${analystScore}`,
        payload: { criterionSlug, analystScore, reason: reason ?? null },
        visibility: "internal",
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      criterionSlug,
      analystScore,
      composite: hasAnalystOverride ? Math.round(analystSum) : Math.round(aiSum),
    },
  });
});
