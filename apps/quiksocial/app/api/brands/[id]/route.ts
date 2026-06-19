/**
 * /api/brands/[id] — GET one, PATCH update, DELETE workspace.
 *
 * Ported to QuikIT (Phase 3, Batch 1). Read access: creator OR
 * BrandMembership. PATCH/DELETE: creator only. _id alias preserved.
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

const patchBrandSchema = z
  .object({
    name: z.string().optional(),
    industry: z.string().optional(),
    websiteUrl: z.string().nullish(),
    country: z.string().nullish(),
    tagline: z.string().nullish(),
    about: z.string().nullish(),
    brandStory: z.string().nullish(),
    logoUrl: z.string().nullish(),
    brandVoice: z.string().nullish(),
    writingStyle: z.string().nullish(),
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
    toneAttributes: z.array(z.string()).optional(),
    hashtags: z.array(z.string()).optional(),
    thingsToAvoid: z.array(z.string()).optional(),
    usps: z.array(z.string()).optional(),
  })
  .passthrough();

const deleteBrandSchema = z.object({ confirmName: z.string().min(1) });

// ---------------------------------------------------------------------------
// GET /api/brands/[id]
// ---------------------------------------------------------------------------
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const brand = await db.brand.findFirst({
      where: {
        id: params.id,
        orgId,
        OR: [
          { createdBy: userId },
          { memberships: { some: { orgId, userId } } },
        ],
      },
    });

    if (!brand) {
      return NextResponse.json({ success: false, error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { brand: { ...withCompatId(brand), userId: brand.createdBy } },
    });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/brands/[id]
// ---------------------------------------------------------------------------
export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = patchBrandSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await db.brand.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Brand not found" }, { status: 404 });
    }

    // Whitelisted scalar fields the wizard / settings UI may write.
    const directFields = [
      "name",
      "industry",
      "websiteUrl",
      "country",
      "tagline",
      "about",
      "brandStory",
      "logoUrl",
      "brandVoice",
      "writingStyle",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const key of directFields) {
      if (key in body && body[key] !== undefined) {
        // writingStyle on the wire → writing_style in the DB.
        const dbKey = key === "writingStyle" ? "writing_style" : key;
        updates[dbKey] = body[key];
      }
    }

    if ("primaryColor" in body) {
      const v = safeHex(body.primaryColor);
      updates.primaryColors = v ? [v] : [];
    }
    if ("secondaryColor" in body) {
      const v = safeHex(body.secondaryColor);
      updates.secondaryColors = v ? [v] : [];
    }
    if ("accentColor" in body) {
      updates.accentColor = safeHex(body.accentColor);
    }

    if (body.typography && typeof body.typography === "object") {
      updates.brandTypography = {
        headline_font: body.typography.primary ?? null,
        body_font: body.typography.secondary ?? null,
        accent_font: body.typography.accent ?? null,
      };
    }

    const arrayPairs: Array<[keyof typeof body, string]> = [
      ["toneAttributes", "brandTone"],
      ["hashtags", "hashtags"],
      ["thingsToAvoid", "thingsToAvoid"],
      ["usps", "keySellingPoints"],
    ];
    for (const [bodyKey, modelKey] of arrayPairs) {
      const v = body[bodyKey];
      if (Array.isArray(v)) {
        updates[modelKey] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const updated = await db.brand.update({
      where: { id: params.id },
      data: { ...updates, updatedBy: userId },
    });

    return NextResponse.json({
      success: true,
      data: { brand: { ...withCompatId(updated), userId: updated.createdBy } },
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/brands/[id] — permanent delete with confirmation
// ---------------------------------------------------------------------------
export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => ({}));
    const parsed = deleteBrandSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Confirmation name is required" },
        { status: 400 },
      );
    }

    const brand = await db.brand.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true, name: true },
    });
    if (!brand) {
      return NextResponse.json({ success: false, error: "Brand not found" }, { status: 404 });
    }

    if (parsed.data.confirmName.trim() !== brand.name.trim()) {
      return NextResponse.json(
        { success: false, error: "Confirmation name does not match workspace name" },
        { status: 400 },
      );
    }

    // Cascade handles Posts / Campaigns / Products / Services / Assets /
    // SocialAccount / BrandMembership / BrandInviteAssignment.
    // UserPreference.activeBrandId gets nulled by onDelete: SetNull.
    await db.brand.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, data: null });
  },
);
