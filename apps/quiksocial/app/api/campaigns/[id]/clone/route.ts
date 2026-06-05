/**
 * POST /api/campaigns/[id]/clone
 *
 * Body (all optional):
 *   useSameOfferings: boolean — copy offeringIds across (alias:
 *                               useSameProducts for legacy clients).
 *
 * Clone rules:
 *   Copies   → name, totalPosts, frequency, weeklyDay, monthlyDate,
 *              postTime, brandColors, themeRotationPlan
 *   Clears   → describeConcept, celeryTaskId, generatedPosts,
 *              failedPosts, assetIds, status
 *   Optional → offeringIds (only if useSameOfferings/useSameProducts=true)
 *   Set      → clonedFromId = source.id; new dates start from today
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function aliasCampaign<T extends AnyRow>(
  c: T,
): T & {
  _id: unknown;
  userId: unknown;
  brandColors: { primary: string | null; secondary: string | null; accent: string | null };
} {
  return {
    ...c,
    _id: c.id,
    userId: c.createdBy ?? null,
    brandColors: {
      primary: (c.brandColorPrimary as string | null) ?? null,
      secondary: (c.brandColorSecondary as string | null) ?? null,
      accent: (c.brandColorAccent as string | null) ?? null,
    },
  };
}

const cloneSchema = z
  .object({
    useSameOfferings: z.boolean().optional(),
    // Legacy alias from pre-Offering clients.
    useSameProducts: z.boolean().optional(),
  })
  .partial();

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => ({}));
    const body = cloneSchema.parse(json ?? {});
    const useSameOfferings = Boolean(body.useSameOfferings ?? body.useSameProducts);

    const source = await db.campaign.findFirst({
      where: { id: params.id, orgId },
    });
    if (!source) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }
    if (source.createdBy !== userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const cloneName = `${source.name} (Copy)`;
    const originalDuration =
      new Date(source.endDate).getTime() - new Date(source.startDate).getTime();
    const newStart = new Date();
    const newEnd = new Date(newStart.getTime() + originalDuration);

    const cloned = await db.campaign.create({
      data: {
        orgId,
        brandId: source.brandId,
        createdBy: userId,
        name: cloneName,
        objective: source.objective,
        status: "draft",
        startDate: newStart,
        endDate: newEnd,
        frequency: source.frequency,
        weeklyDay: source.weeklyDay ?? null,
        monthlyDate: source.monthlyDate ?? null,
        postTime: source.postTime ?? "09:00",
        timezone: source.timezone ?? "UTC",
        totalPosts: source.totalPosts ?? 0,
        generatedPosts: 0,
        describeConcept: null, // intentionally cleared
        includeLogo: source.includeLogo,
        offeringIds: useSameOfferings ? source.offeringIds ?? [] : [],
        assetIds: [], // intentionally cleared
        brandColorPrimary: source.brandColorPrimary,
        brandColorSecondary: source.brandColorSecondary,
        brandColorAccent: source.brandColorAccent,
        themeRotationPlan: (source.themeRotationPlan ?? undefined) as never,
        templateId: source.templateId ?? null,
        clonedFromId: source.id,
        failedPosts: 0,
      },
    });

    return NextResponse.json(
      { success: true, data: { campaign: aliasCampaign(cloned) } },
      { status: 201 },
    );
  },
);
