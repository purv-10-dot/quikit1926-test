/**
 * /api/campaigns — GET list, POST create.
 *
 * Ported to QuikIT (Phase 3, Batch 2). brandColors preserves the
 * explode-on-write / recompose-on-read pattern: the frontend sends
 * `brandColors: { primary, secondary, accent }`; the DB stores them as
 * three nullable scalar columns; the alias function rebuilds the object
 * shape on response.
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

const hexRe = /^#[0-9A-Fa-f]{6}$/;

const createCampaignSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(200),
  objective: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  frequency: z.string().min(1),
  weeklyDay: z.number().int().min(0).max(6).nullish(),
  monthlyDate: z.number().int().min(1).max(31).nullish(),
  postTime: z.string().optional(),
  timezone: z.string().optional(),
  totalPosts: z.number().int().min(0).optional(),
  describeConcept: z.string().nullish(),
  includeLogo: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
  serviceIds: z.array(z.string()).optional(),
  assetIds: z.array(z.string()).optional(),
  brandColors: z
    .object({
      primary: z.string().nullish(),
      secondary: z.string().nullish(),
      accent: z.string().nullish(),
    })
    .optional(),
  templateId: z.string().nullish(),
  clonedFromId: z.string().nullish(),
  attachedProduct: z.unknown().optional(),
  attachedService: z.unknown().optional(),
  attachedAsset: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/campaigns?brandId=X
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 400 },
    );
  }

  const rows = await db.campaign.findMany({
    where: { orgId, brandId, createdBy: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    data: { campaigns: rows.map(aliasCampaign) },
  });
});

// ---------------------------------------------------------------------------
// POST /api/campaigns
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 422 },
    );
  }
  const body = parsed.data;

  // Hex-validate the colors (Zod accepted any string; enforce format here).
  if (body.brandColors) {
    for (const key of ["primary", "secondary", "accent"] as const) {
      const val = body.brandColors[key];
      if (val && !hexRe.test(val)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid hex color for brandColors.${key}: ${val}`,
          },
          { status: 422 },
        );
      }
    }
  }

  const created = await db.campaign.create({
    data: {
      orgId,
      brandId: body.brandId,
      createdBy: userId,
      name: body.name.trim(),
      objective: body.objective,
      status: "draft",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      frequency: body.frequency,
      weeklyDay: body.weeklyDay ?? null,
      monthlyDate: body.monthlyDate ?? null,
      postTime: body.postTime ?? "09:00",
      timezone: body.timezone ?? "UTC",
      totalPosts: body.totalPosts ?? 0,
      describeConcept: body.describeConcept?.trim() ?? null,
      includeLogo: body.includeLogo ?? true,
      productIds: body.productIds ?? [],
      serviceIds: body.serviceIds ?? [],
      assetIds: body.assetIds ?? [],
      brandColorPrimary: body.brandColors?.primary ?? null,
      brandColorSecondary: body.brandColors?.secondary ?? null,
      brandColorAccent: body.brandColors?.accent ?? null,
      templateId: body.templateId ?? null,
      clonedFromId: body.clonedFromId ?? null,
      attachedProduct: (body.attachedProduct ?? undefined) as never,
      attachedService: (body.attachedService ?? undefined) as never,
      attachedAsset: (body.attachedAsset ?? undefined) as never,
    },
  });

  return NextResponse.json(
    { success: true, data: { campaign: aliasCampaign(created) } },
    { status: 201 },
  );
});
