/**
 * POST /api/posts/generate-image
 *
 * Resolves the active brand once, enriches the FastAPI payload with
 * every brand-level field BrandIdentity / VisualBranding / SeoSocial
 * accepts, then proxies to the Python /generate-image endpoint.
 *
 * Ported to QuikIT (Phase 3, Batch 2):
 *   - Active brand resolution moved from session.user.activeBrandId
 *     (legacy) to app_quiksocial.UserPreference.activeBrandId per (orgId, userId)
 *   - { orgId, userId } added to FastAPI payload
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

const generateImageSchema = z
  .object({
    selectedIdeaTitle: z.string().min(1),
    prompt: z.string().min(1),
    brandId: z.string().optional(),
  })
  .passthrough();

interface BrandTypography {
  headline_font?: string | null;
  body_font?: string | null;
  accent_font?: string | null;
}

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = generateImageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "selectedIdeaTitle and prompt are required" },
      { status: 422 },
    );
  }
  const body = parsed.data as Record<string, unknown> & { brandId?: string };

  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8055";
  const internalToken = process.env.QS_INTERNAL_TOKEN;

  if (!internalToken) {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  // Resolve active brand: explicit body.brandId override → UserPreference fallback.
  let activeBrandId: string | null = body.brandId ?? null;
  if (!activeBrandId) {
    const pref = await db.userPreference.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { activeBrandId: true },
    });
    activeBrandId = pref?.activeBrandId ?? null;
  }

  let brand: Record<string, unknown> | null = null;
  if (activeBrandId) {
    brand = (await db.brand.findFirst({
      where: { id: activeBrandId, orgId },
    })) as Record<string, unknown> | null;
  }

  const typo: BrandTypography = (brand?.brandTypography as BrandTypography) ?? {};
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const enrichedBody = {
    ...body,
    org_id: orgId,
    user_id: userId,
    website: body.website ?? brand?.websiteUrl ?? null,
    industry: body.industry ?? brand?.industry ?? null,
    tagline: body.tagline ?? brand?.tagline ?? null,
    country: body.country ?? brand?.country ?? null,
    brandStory: body.brandStory ?? brand?.brandStory ?? null,
    writingStyle: body.writingStyle ?? brand?.writing_style ?? null,
    headlineFont: body.headlineFont ?? typo.headline_font ?? null,
    bodyFont: body.bodyFont ?? typo.body_font ?? null,
    toneAttributes: arr(body.toneAttributes).length
      ? arr(body.toneAttributes)
      : arr(brand?.brandTone),
    keySellingPoints: arr(body.keySellingPoints).length
      ? arr(body.keySellingPoints)
      : arr(brand?.keySellingPoints),
    thingsToAvoid: arr(body.thingsToAvoid).length
      ? arr(body.thingsToAvoid)
      : arr(brand?.thingsToAvoid),
    brandValues: arr(body.brandValues).length
      ? arr(body.brandValues)
      : arr(brand?.brandValues),
    preferredWords: arr(body.preferredWords).length
      ? arr(body.preferredWords)
      : arr(brand?.preferredWords),
    keywords: arr(body.keywords).length
      ? arr(body.keywords)
      : arr(brand?.keywords),
    hashtags: arr(body.hashtags).length ? arr(body.hashtags) : arr(brand?.hashtags),
    targetAudience: body.targetAudience ?? brand?.targetAudience ?? null,
  };

  try {
    const upstream = await fetch(`${aiServiceUrl}/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": internalToken,
      },
      body: JSON.stringify(enrichedBody),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!upstream.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            (data.detail as string | undefined) ?? "Failed to queue image generation",
        },
        { status: 502 },
      );
    }

    const jobId = (data.job_id as string | undefined) ?? (data.jobId as string | undefined) ?? null;
    const wsToken =
      (data.ws_token as string | undefined) ?? (data.wsToken as string | undefined) ?? null;

    if (!jobId || !wsToken) {
      return NextResponse.json(
        { success: false, error: "AI service did not return a job id." },
        { status: 502 },
      );
    }

    const wsUrl =
      process.env.AI_SERVICE_WS_URL ??
      aiServiceUrl.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`);

    return NextResponse.json({
      success: true,
      data: { jobId, wsToken, wsUrl },
    });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "AI service timed out. Please try again." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not reach the AI service." },
      { status: 502 },
    );
  }
});
