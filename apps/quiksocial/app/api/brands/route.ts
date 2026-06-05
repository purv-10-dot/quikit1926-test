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

// Unified offering input (Phase 2). Older clients send the legacy
// products[] / services[] arrays; this schema also accepts the new
// `offerings[]` array with a free-string `type` and a unified `price`
// field. POST handler folds everything into a single Offering write.
const offeringInputSchema = z
  .object({
    type: z.string().nullish(),
    name: z.string().min(1),
    description: z.string().nullish(),
    image_url: z.string().nullish(),
    image_urls: z.array(z.string()).optional(),
    price: z.string().nullish(),
    pricing: z.string().nullish(), // legacy alias for Service.pricing
    currency: z.string().nullish(),
    duration: z.string().nullish(),
    category: z.string().nullish(),
    url: z.string().nullish(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

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
    offerings: z.array(offeringInputSchema).optional(),
    // Legacy — accepted and folded into offerings[] by the POST handler.
    products: z.array(offeringInputSchema).optional(),
    services: z.array(offeringInputSchema).optional(),
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

    // Unified offerings ingestion (Phase 2). Accepts the new `offerings[]`
    // array (each with a `type` field), OR the legacy products[]+services[]
    // arrays. Legacy items are tagged with type="product" / type="service"
    // so the catalog UI groups them sensibly.
    type IncomingItem = z.infer<typeof offeringInputSchema>;
    const incoming: IncomingItem[] = [];

    if (Array.isArray(body.offerings)) {
      for (const o of body.offerings) {
        if (!o?.name?.trim()) continue;
        incoming.push({ ...o, type: o.type?.trim() || "product" });
      }
    }
    if (Array.isArray(body.products)) {
      for (const p of body.products) {
        if (!p?.name?.trim()) continue;
        incoming.push({ ...p, type: "product" });
      }
    }
    if (Array.isArray(body.services)) {
      for (const s of body.services) {
        if (!s?.name?.trim()) continue;
        // Map legacy service.pricing → unified Offering.price.
        const price = s.price ?? s.pricing ?? null;
        incoming.push({ ...s, type: "service", price });
      }
    }

    if (incoming.length > 0) {
      const offeringRows = incoming.map((o, idx) => ({
        orgId,
        brandId: brand.id,
        createdBy: userId,
        type: o.type?.trim() || "product",
        name: o.name.trim(),
        description: o.description ?? null,
        imageUrls:
          typeof o.image_url === "string" && o.image_url
            ? [o.image_url]
            : Array.isArray(o.image_urls)
            ? o.image_urls.filter((u): u is string => typeof u === "string" && u.length > 0)
            : [],
        price: typeof o.price === "string" ? o.price : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        category: typeof o.category === "string" ? o.category : null,
        duration: typeof o.duration === "string" ? o.duration : null,
        url: typeof o.url === "string" ? o.url : null,
        tags: toStringArray(o.tags),
        sortOrder: idx,
      }));
      await tx.offering.createMany({ data: offeringRows });
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
