/**
 * /api/brands — GET list, POST create.
 *
 * Patterns used (match the monorepo standard):
 *   - withOrgAuth wrapper for session + orgId resolution
 *   - { success, data } envelope per CLAUDE.md
 *   - Zod input validation
 *   - _id alias preserved on every record (frontend compat)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const hexRe = /^#[0-9A-Fa-f]{6}$/;
const safeHex = (val: unknown): string | null =>
  typeof val === "string" && hexRe.test(val.trim()) ? val.trim() : null;

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const productInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  image_url: z.string().nullish(),
  price: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

const serviceInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  image_url: z.string().nullish(),
  pricing: z.string().nullish(),
  duration: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

const createBrandSchema = z
  .object({
    name: z.string().min(1).max(120),
    industry: z.string().optional(),
    websiteUrl: z.string().optional(),
    country: z.string().optional(),
    tagline: z.string().optional(),
    about: z.string().optional(),
    brandStory: z.string().optional(),
    logoUrl: z.string().nullish(),
    primaryColor: z.string().nullish(),
    secondaryColor: z.string().nullish(),
    accentColor: z.string().nullish(),
    typography: z
      .object({
        primary: z.string().nullish(),
        secondary: z.string().nullish(),
        accent: z.string().nullish(),
      })
      .optional(),
    brandVoice: z.string().optional(),
    toneAttributes: z.array(z.string()).optional(),
    hashtags: z.array(z.string()).optional(),
    thingsToAvoid: z.array(z.string()).optional(),
    usps: z.array(z.string()).optional(),
    brandValues: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    preferredWords: z.array(z.string()).optional(),
    targetAudience: z.unknown().optional(),
    writingStyle: z.string().optional(),
    scrapeData: z.unknown().optional(),
    products: z.array(productInputSchema).optional(),
    services: z.array(serviceInputSchema).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// GET /api/brands — list every brand the user can access in the org
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  // Resolve every brandId the caller has a membership for — this is what
  // makes invited users see their workspace. Brands they CREATED are
  // included via the OR branch below regardless of membership.
  const memberships = await db.brandMembership.findMany({
    where: { orgId, userId },
    select: { brandId: true },
  });
  const memberBrandIds = memberships.map((m) => m.brandId);

  const rows = await db.brand.findMany({
    where: {
      orgId,
      OR: [{ createdBy: userId }, { id: { in: memberBrandIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const brands = rows.map((b) => ({ ...withCompatId(b), userId: b.createdBy }));
  return NextResponse.json({ success: true, data: { brands } });
});

// ---------------------------------------------------------------------------
// POST /api/brands — create a brand from the wizard payload
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createBrandSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 422 },
    );
  }
  const body = parsed.data;

  // Scrape-fallback enrichment: the wizard collects only a subset of the
  // brand-identity fields the AI pipeline cares about. The scraper fills
  // the rest into pendingScrapeData; promote those into typed columns
  // when the wizard didn't supply them.
  const WIZARD_DEFAULT_PRIMARY = "#1A1A2E";
  const WIZARD_DEFAULT_SECONDARY = "#FFFFFF";
  const WIZARD_DEFAULT_ACCENT = "#FF6B35";
  const normHex = (h: string | null): string | null => (h ? h.toUpperCase() : null);

  const scrape = (body.scrapeData ?? null) as Record<string, unknown> | null;
  const scrapeIdentity = (scrape?.brand_identity ?? {}) as Record<string, unknown>;
  const scrapeSeo = (scrape?.seo_social ?? {}) as Record<string, unknown>;
  const scrapeVisual = (scrape?.visual_branding ?? {}) as Record<string, unknown>;

  const bodyPrimary = safeHex(body.primaryColor);
  const bodySecondary = safeHex(body.secondaryColor);
  const bodyAccent = safeHex(body.accentColor);

  const scrapedPrimary = safeHex(scrapeVisual.primary_color);
  const scrapedSecondary = safeHex(scrapeVisual.secondary_color);
  const scrapedAccent = safeHex(scrapeVisual.accent_color);

  const primary =
    normHex(bodyPrimary) === WIZARD_DEFAULT_PRIMARY && scrapedPrimary
      ? scrapedPrimary
      : bodyPrimary;
  const secondary =
    normHex(bodySecondary) === WIZARD_DEFAULT_SECONDARY && scrapedSecondary
      ? scrapedSecondary
      : bodySecondary;
  const accent =
    normHex(bodyAccent) === WIZARD_DEFAULT_ACCENT && scrapedAccent ? scrapedAccent : bodyAccent;

  const bodyBrandValues = body.brandValues ?? [];
  const bodyKeywords = body.keywords ?? [];
  const bodyPreferredWords = body.preferredWords ?? [];

  const brandValues =
    bodyBrandValues.length > 0 ? bodyBrandValues : toStringArray(scrapeIdentity.brand_values);
  const keywords = bodyKeywords.length > 0 ? bodyKeywords : toStringArray(scrapeSeo.keywords);
  const preferredWords =
    bodyPreferredWords.length > 0
      ? bodyPreferredWords
      : toStringArray(scrapeIdentity.preferred_words);

  const targetAudience =
    body.targetAudience !== undefined && body.targetAudience !== null
      ? body.targetAudience
      : scrapeIdentity.target_audience ?? null;

  const created = await db.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: {
        orgId,
        createdBy: userId,
        name: body.name.trim(),
        industry: body.industry?.trim() || "Other",
        websiteUrl: body.websiteUrl?.trim() || null,
        country: body.country?.trim() || null,
        tagline: body.tagline?.trim() || null,
        about: body.about?.trim() || null,
        brandStory: body.brandStory?.trim() || null,
        logoUrl: body.logoUrl || null,
        primaryColors: primary ? [primary] : [],
        secondaryColors: secondary ? [secondary] : [],
        accentColor: accent ?? null,
        brandTypography: body.typography
          ? {
              headline_font: body.typography.primary || null,
              body_font: body.typography.secondary || null,
              accent_font: body.typography.accent || null,
            }
          : undefined,
        brandVoice: body.brandVoice?.trim() || null,
        brandTone: body.toneAttributes ?? [],
        hashtags: body.hashtags ?? [],
        thingsToAvoid: body.thingsToAvoid ?? [],
        keySellingPoints: body.usps ?? [],
        brandValues,
        keywords,
        preferredWords,
        targetAudience: targetAudience as never,
        writing_style: body.writingStyle?.trim() || null,
        analysisStatus: body.scrapeData ? "completed" : null,
        pendingScrapeData: (body.scrapeData ?? undefined) as never,
        isDefault: false,
      },
    });

    if (body.products && body.products.length > 0) {
      const productRows = body.products
        .filter((p) => p.name?.trim())
        .map((p, idx) => ({
          orgId,
          brandId: brand.id,
          createdBy: userId,
          name: p.name.trim(),
          description: p.description ?? null,
          imageUrls: typeof p.image_url === "string" && p.image_url ? [p.image_url] : [],
          price: p.price ?? null,
          category: p.category ?? null,
          tags: p.tags ?? [],
          sortOrder: idx,
        }));
      if (productRows.length > 0) {
        await tx.product.createMany({ data: productRows });
      }
    }

    if (body.services && body.services.length > 0) {
      const serviceRows = body.services
        .filter((s) => s.name?.trim())
        .map((s, idx) => ({
          orgId,
          brandId: brand.id,
          createdBy: userId,
          name: s.name.trim(),
          description: s.description ?? null,
          imageUrls: typeof s.image_url === "string" && s.image_url ? [s.image_url] : [],
          pricing: s.pricing ?? null,
          duration: s.duration ?? null,
          category: s.category ?? null,
          tags: s.tags ?? [],
          sortOrder: idx,
        }));
      if (serviceRows.length > 0) {
        await tx.service.createMany({ data: serviceRows });
      }
    }

    return brand;
  });

  // Set the new brand as the active one for this user (per-org scope).
  await db.userPreference.upsert({
    where: { orgId_userId: { orgId, userId } },
    update: { activeBrandId: created.id },
    create: { orgId, userId, activeBrandId: created.id },
  });

  return NextResponse.json(
    { success: true, data: { brand: { ...withCompatId(created), userId: created.createdBy } } },
    { status: 201 },
  );
});
