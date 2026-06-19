/**
 * POST /api/internal/auto-reply/responder-context
 *
 * Phase 2 — single endpoint that joins everything the AI responder needs
 * to build a brand-voiced, offering-aware prompt:
 *   - Post (caption + original prompt + attached snapshot)
 *   - Brand (voice / tone / values / things to avoid)
 *   - First Offering from Post.selectedOfferingIds
 *
 * Falls back to Post.attachedOffering JSON snapshot when there's no live
 * Offering row to fetch (legacy post pre-Offering rows since deleted).
 *
 * Forward compat: when Brand Brain ships, the response shape stays the
 * same — this route adds the enricher call before returning. The Python
 * responder reads `offering.type` to branch its prompt template on
 * product / service / menu_item / etc.
 *
 * Accepts both `orgId` (canonical) and `tenantId` (legacy wire-format
 * from the Python service).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import {
  ResponderContextRequestSchema,
  resolveOrgId,
  type ResponderContextResponse,
} from "@/lib/auto-reply/types";

/** Coerce an unknown JSON snapshot (Post.attachedOffering) into a shape
 *  the prompt builder can read. Snapshots may be partial — missing fields
 *  default to null/empty so the template doesn't render literal "undefined". */
function coerceOfferingSnapshot(
  raw: unknown,
): ResponderContextResponse["offering"] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name : null;
  if (!name) return null;
  return {
    type:
      typeof r.type === "string" && r.type.trim()
        ? r.type
        : // Legacy snapshots from before Phase 2 carry no `type`. Default
          // to "product" so the responder template still gets a stable
          // branch.
          "product",
    name,
    description: typeof r.description === "string" ? r.description : null,
    price:
      typeof r.price === "string"
        ? r.price
        : typeof r.pricing === "string"
        ? r.pricing
        : null,
    duration: typeof r.duration === "string" ? r.duration : null,
    category: typeof r.category === "string" ? r.category : null,
    tags: Array.isArray(r.tags)
      ? r.tags.filter((x): x is string => typeof x === "string")
      : [],
    // Snapshots typically don't carry features / problemsSolved — leave empty.
    features: [],
    problemsSolved: [],
  };
}

export async function POST(req: NextRequest) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = ResponderContextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { postId } = parsed.data;
  const orgId = resolveOrgId(parsed.data);
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 422 },
    );
  }

  const post = await db.post.findFirst({
    where: { id: postId, orgId },
    select: {
      content: true,
      prompt: true,
      selectedOfferingIds: true,
      attachedOffering: true,
      brand: {
        select: {
          name: true,
          brandVoice: true,
          brandTone: true,
          brandValues: true,
          thingsToAvoid: true,
        },
      },
    },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found in org" }, { status: 404 });
  }

  // Prefer the live Offering row over the snapshot — fresher data + carries
  // features / problemsSolved (formerly Product-only fields) that the
  // snapshot doesn't preserve.
  let offering: ResponderContextResponse["offering"] = null;
  if (post.selectedOfferingIds && post.selectedOfferingIds.length > 0) {
    const live = await db.offering.findFirst({
      where: { id: { in: post.selectedOfferingIds }, orgId },
      select: {
        type: true,
        name: true,
        description: true,
        price: true,
        duration: true,
        category: true,
        tags: true,
        proofPoints: true,
        problemsSolved: true,
      },
    });
    if (live) {
      offering = {
        type: live.type,
        name: live.name,
        description: live.description,
        price: live.price,
        duration: live.duration,
        category: live.category,
        tags: live.tags,
        features: live.proofPoints,
        problemsSolved: live.problemsSolved,
      };
    }
  }
  if (!offering) {
    offering = coerceOfferingSnapshot(post.attachedOffering);
  }

  const response: ResponderContextResponse = {
    brandName: post.brand.name,
    brandVoice: post.brand.brandVoice,
    brandTone: post.brand.brandTone ?? [],
    brandValues: post.brand.brandValues ?? [],
    thingsToAvoid: post.brand.thingsToAvoid ?? [],
    postCaption: post.content ?? "",
    originalPrompt: post.prompt ?? null,
    offering,
  };

  return NextResponse.json(response);
}
