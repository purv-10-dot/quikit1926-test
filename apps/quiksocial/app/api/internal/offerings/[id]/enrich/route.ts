/**
 * PATCH /api/internal/offerings/[id]/enrich
 *
 * Receives detail-page enrichment from the Python `enrich_offerings_task`.
 * The Python side fetched the offering's detail page and ran
 * `scrape_product_detail`; we fill in fields that are still null/empty.
 *
 * Do-not-overwrite contract:
 *   - Existing non-empty values STAY (the user may have edited them on
 *     the wizard's Step 6 review screen before brand creation committed).
 *   - imageUrls is "non-empty" when array length > 0.
 *   - description / category / price are "non-empty" when string is set
 *     and not whitespace-only.
 *   - name is intentionally NEVER overwritten — the wizard captured the
 *     user-confirmed name; a detail-page scrape with a slightly different
 *     name should not stomp it.
 *
 * Auth: X-QS-Internal-Token header (shared with the Python AI service).
 * Scope: orgId from body must match the Offering row's orgId.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";

interface EnrichBody {
  orgId?: string;
  // Back-compat: Python service may still send `tenantId`. Accepted as alias.
  tenantId?: string;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  price?: string | null;
}

function isFilledString(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const tokenError = checkInternalToken(req);
  if (tokenError) return tokenError;

  const body = (await req.json().catch(() => null)) as EnrichBody | null;
  const orgIdRaw = body?.orgId ?? body?.tenantId;
  if (!body || !isFilledString(orgIdRaw)) {
    return NextResponse.json(
      { success: false, error: "orgId is required", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const orgId = (orgIdRaw as string).trim();
  const offeringId = params.id;

  const existing = await db.offering.findFirst({
    where: { id: offeringId, orgId },
    select: {
      id: true,
      description: true,
      imageUrls: true,
      category: true,
      price: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Offering not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const data: Record<string, unknown> = {};

  if (isFilledString(body.description) && !isFilledString(existing.description)) {
    data.description = body.description!.trim().slice(0, 1000);
  }
  if (
    isFilledString(body.imageUrl) &&
    (!Array.isArray(existing.imageUrls) || existing.imageUrls.length === 0)
  ) {
    data.imageUrls = [body.imageUrl!.trim()];
  }
  if (isFilledString(body.category) && !isFilledString(existing.category)) {
    data.category = body.category!.trim().slice(0, 120);
  }
  if (isFilledString(body.price) && !isFilledString(existing.price)) {
    data.price = body.price!.trim().slice(0, 60);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: true, data: { updated: false, fields: [] } });
  }

  await db.offering.update({
    where: { id: offeringId },
    data,
  });

  return NextResponse.json({
    success: true,
    data: { updated: true, fields: Object.keys(data) },
  });
}
