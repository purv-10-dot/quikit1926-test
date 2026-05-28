/**
 * POST /api/campaigns/generate
 *
 * Resolves the campaign + brand + products + services in Postgres, then
 * proxies the assembled payload to FastAPI /generate-campaign.
 *
 * Ported to QuikIT (Phase 3, Batch 2):
 *   - withOrgAuth wrapper
 *   - { orgId, userId } added to FastAPI payload
 *   - { success, data } envelope
 *   - brandColors recomposed from the three scalar columns on read
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
// Brands created before the wizard's accent default changed still carry
// literal #0000FF, which renders as a glaring blue CTA. Treat the legacy
// default as "unset" so the caller's neutral fallback wins.
const LEGACY_DEFAULT_BLUE = new Set(["#0000FF", "#0000ff"]);

function safeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return fallback;
  if (LEGACY_DEFAULT_BLUE.has(trimmed)) return fallback;
  return trimmed.toUpperCase();
}

const generateSchema = z.object({ campaignId: z.string().min(1) });

interface BrandTypography {
  headline_font?: string | null;
  body_font?: string | null;
  accent_font?: string | null;
}

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = generateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "campaignId is required" },
      { status: 422 },
    );
  }
  const { campaignId } = parsed.data;

  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8055";
  const internalToken = process.env.QS_INTERNAL_TOKEN;

  if (!internalToken) {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  // Fetch + authorize campaign.
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, orgId },
  });
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }
  if (campaign.createdBy !== userId) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  if (!campaign.totalPosts || campaign.totalPosts <= 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Campaign has no posts to generate. Set a date range first.",
      },
      { status: 422 },
    );
  }

  const brand = await db.brand.findFirst({
    where: { id: campaign.brandId, orgId },
  });
  if (!brand) {
    return NextResponse.json(
      { success: false, error: "Brand not found for campaign" },
      { status: 404 },
    );
  }

  const offeringIds: string[] = Array.isArray(campaign.offeringIds)
    ? campaign.offeringIds
    : [];

  const offerings =
    offeringIds.length > 0
      ? await db.offering.findMany({ where: { orgId, id: { in: offeringIds } } })
      : [];

  // Re-split into the products/services arrays the AI service still expects
  // on the payload. Once the Python side moves to a unified `offerings`
  // array, drop this split and ship a single `offerings: offerings.map(...)`.
  const products = offerings.filter(
    (o) => o.type !== "service" && o.type !== "treatment",
  );
  const services = offerings.filter(
    (o) => o.type === "service" || o.type === "treatment",
  );

  // Resolve colors. Campaign snapshot wins; fall back to brand fields.
  const primary = safeHex(
    campaign.brandColorPrimary ?? brand.primaryColors?.[0],
    "#0A0A0A",
  );
  const secondary = safeHex(
    campaign.brandColorSecondary ?? brand.secondaryColors?.[0],
    "#FFFFFF",
  );
  const accent = safeHex(
    campaign.brandColorAccent ?? brand.accentColor,
    "#FF6B35",
  );

  const typo: BrandTypography = (brand.brandTypography as BrandTypography) ?? {};

  const payload = {
    org_id: orgId,
    user_id: userId,
    campaignId: campaign.id,
    brandId: campaign.brandId,
    brandName: brand.name,
    brandAbout: brand.about ?? null,
    brandVoice: brand.brandVoice ?? null,
    industry: brand.industry ?? null,
    tagline: brand.tagline ?? null,
    country: brand.country ?? null,
    website: brand.websiteUrl ?? null,
    brandStory: brand.brandStory ?? null,
    writingStyle: brand.writing_style ?? null,
    competitorDiff: brand.competitorDiff ?? null,
    headlineFont: typo.headline_font ?? null,
    bodyFont: typo.body_font ?? null,
    toneAttributes: Array.isArray(brand.brandTone) ? brand.brandTone : [],
    keySellingPoints: Array.isArray(brand.keySellingPoints) ? brand.keySellingPoints : [],
    thingsToAvoid: Array.isArray(brand.thingsToAvoid) ? brand.thingsToAvoid : [],
    brandValues: Array.isArray(brand.brandValues) ? brand.brandValues : [],
    preferredWords: Array.isArray(brand.preferredWords) ? brand.preferredWords : [],
    keywords: Array.isArray(brand.keywords) ? brand.keywords : [],
    hashtags: Array.isArray(brand.hashtags) ? brand.hashtags : [],
    targetAudience: brand.targetAudience ?? null,
    colors: { primary, secondary, accent },
    logoUrl: brand.logoUrl ?? null,
    includeLogo: campaign.includeLogo !== false,
    objective: campaign.objective,
    totalPosts: campaign.totalPosts,
    describeConcept: campaign.describeConcept ?? null,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: p.price ?? null,
      category: p.category ?? null,
      tags: Array.isArray(p.tags) ? p.tags : [],
      image_url:
        Array.isArray(p.imageUrls) && p.imageUrls.length > 0 ? p.imageUrls[0] : null,
    })),
    services: services.map((s) => ({
      id: s.id,
      // Offering uses `price` for everything; the AI service's Service shape
      // still calls the field `pricing`. Map for back-compat.
      name: s.name,
      description: s.description ?? null,
      pricing: s.price ?? null,
      duration: s.duration ?? null,
      category: s.category ?? null,
      tags: Array.isArray(s.tags) ? s.tags : [],
      image_url:
        Array.isArray(s.imageUrls) && s.imageUrls.length > 0 ? s.imageUrls[0] : null,
    })),
    platforms: ["instagram"],
    attachedOffering: campaign.attachedOffering ?? null,
    attachedAsset: campaign.attachedAsset ?? null,
  };

  try {
    const upstream = await fetch(`${aiServiceUrl}/generate-campaign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": internalToken,
      },
      body: JSON.stringify(payload),
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
            (data.detail as string | undefined) ??
            "Failed to queue campaign generation",
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

    // Persist the queue marker so a user who navigates away can re-attach
    // a poller on return. Best-effort — a write failure here doesn't block
    // the response.
    try {
      await db.campaign.update({
        where: { id: campaign.id },
        data: {
          celeryTaskId: jobId,
          lastGeneratedAt: new Date(),
        },
      });
    } catch (err) {
      console.warn(
        "[POST /api/campaigns/generate] Failed to write celeryTaskId/lastGeneratedAt — resume-on-mount may miss this run",
        err,
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
    console.error("[POST /api/campaigns/generate]", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the AI service." },
      { status: 502 },
    );
  }
});
