/**
 * POST /api/offerings/explore-category
 *
 * Proxies to the Python AI service's /explore-category endpoint. Called by
 * the Brand Creation Wizard's curation step when the user clicks "Explore
 * this category" on one of the discovered category headers.
 *
 * The AI service enforces the SSRF guard (category_url same-domain as
 * base_url); this route validates types and brand-tenant access, then
 * forwards the call with QS_INTERNAL_TOKEN.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

function isLikelyHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  categoryUrl: z.string(),
  baseUrl: z.string(),
  categoryHint: z.string().optional(),
  maxItems: z.number().int().positive().optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 422 },
    );
  }
  const { brandId, categoryUrl, baseUrl, categoryHint, maxItems } = parsed.data;

  if (!isLikelyHttpUrl(categoryUrl)) {
    return NextResponse.json(
      { success: false, error: "categoryUrl must be a full http/https URL" },
      { status: 422 },
    );
  }
  if (!isLikelyHttpUrl(baseUrl)) {
    return NextResponse.json(
      { success: false, error: "baseUrl must be a full http/https URL" },
      { status: 422 },
    );
  }

  // Brand may not exist yet when the wizard is mid-flight (brand POST
  // happens at the end); callers pass brandId="pending" to skip the check.
  // The AI service still enforces SSRF via base_url validation.
  if (brandId !== "pending") {
    const brand = await db.brand.findFirst({
      where: { id: brandId, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!brand) {
      return NextResponse.json({ success: false, error: "Brand not found" }, { status: 404 });
    }
  }

  const aiServiceUrl = (process.env.AI_SERVICE_URL ?? "").trim();
  const internalToken = (process.env.QS_INTERNAL_TOKEN ?? "").trim();
  if (!aiServiceUrl || !internalToken) {
    return NextResponse.json(
      { success: false, error: "AI service not configured" },
      { status: 500 },
    );
  }

  const aiPayload: Record<string, unknown> = {
    category_url: categoryUrl,
    base_url: baseUrl,
    category_hint: categoryHint ?? "",
  };
  if (typeof maxItems === "number" && maxItems > 0) {
    aiPayload.max_items = Math.min(200, Math.floor(maxItems));
  }

  try {
    const upstream = await fetch(`${aiServiceUrl.replace(/\/+$/, "")}/explore-category`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": internalToken,
      },
      body: JSON.stringify(aiPayload),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      detail?: string;
      items?: unknown[];
      fetched?: number;
    };
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: data?.detail ?? "Explore failed", data: { items: [] } },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        items: data?.items ?? [],
        fetched: data?.fetched ?? 0,
      },
    });
  } catch (err) {
    console.error("[explore-category]", err);
    return NextResponse.json(
      { success: false, error: "Upstream request failed", data: { items: [] } },
      { status: 502 },
    );
  }
});
