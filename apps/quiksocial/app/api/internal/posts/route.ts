/**
 * POST /api/internal/posts
 *
 * Server-side post persistence for the Python/Celery campaign worker. The
 * worker is the system of record for campaign posts — it calls this per
 * generated post (plus a completion sweep) so persistence no longer depends
 * on the browser staying connected through the whole 3-4 min run.
 *
 * Auth: X-QS-Internal-Token via `checkInternalToken` — the same guard the
 * /api/internal/auto-reply/* routes use. Fail-closed: if QS_INTERNAL_TOKEN is
 * unset the guard returns 500; a missing/wrong header returns 401.
 *
 * SECURITY — org is NEVER taken from the caller. `orgId`, `brandId` and
 * `createdBy` are derived from the Campaign row (looked up by `campaignId`),
 * so a tokened caller can only ever write a post into the org that owns
 * that campaign. An unknown `campaignId` → 404, no write. This is the
 * cross-org safeguard — do not "optimize" it by trusting a caller-supplied
 * orgId.
 *
 * Idempotent: the row id is deterministic — `cmp_<campaignId>_<postNumber>`.
 * A repeat write (worker retry, or the completion reconcile sweep re-hitting
 * an already-persisted post) trips the Prisma P2002 unique violation, which
 * we catch and return as 200 { deduped: true } — no duplicate row.
 *
 * Row creation mirrors the browser `POST /api/posts` create path: campaign
 * posts are `status="draft"`, `isAiGenerated=true`, platform/scheduling are
 * chosen later by the user.
 *
 * Response shape preserved (no `{ success, data }` envelope) for Python
 * worker parser compatibility — same convention as the existing
 * /api/internal/auto-reply/* routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

export async function POST(req: NextRequest) {
  // Fail-closed token guard (mirrors /api/internal/auto-reply/*).
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const campaignId =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  const platform =
    typeof body?.platform === "string" && body.platform.trim()
      ? body.platform.trim()
      : "instagram";
  const imageUrl =
    typeof body?.imageUrl === "string" && body.imageUrl.trim()
      ? body.imageUrl.trim()
      : null;
  const postNumber = Number(body?.postNumber);

  if (!campaignId || !content.trim() || !Number.isFinite(postNumber)) {
    return NextResponse.json(
      {
        error:
          "campaignId, non-empty content, and numeric postNumber are required",
      },
      { status: 422 },
    );
  }

  // SECURITY: derive org / brand / creator from the Campaign row — NEVER
  // from the caller. A valid token can only write into the campaign's own
  // org; an unknown campaignId writes nothing.
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      orgId: true,
      brandId: true,
      createdBy: true,
      describeConcept: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Deterministic id → idempotency across worker retries + the completion
  // reconcile sweep. `Math.trunc` guards against a float sneaking in.
  const id = `cmp_${campaignId}_${Math.trunc(postNumber)}`;

  try {
    const created = await db.post.create({
      data: {
        id,
        orgId: campaign.orgId,
        brandId: campaign.brandId,
        createdBy: campaign.createdBy ?? null,
        campaignId: campaign.id,
        content,
        platform,
        status: "draft",
        aiImageUrl: imageUrl,
        imageUrls: imageUrl ? [imageUrl] : [],
        isAiGenerated: true,
        // Mirror the browser path: per-post variants have no own prompt, so
        // the campaign concept is the closest field for the Content Hub.
        prompt: campaign.describeConcept ?? null,
      },
    });
    return NextResponse.json({ post: aliasPost(created) }, { status: 201 });
  } catch (err: unknown) {
    // P2002 = unique constraint hit → this post was already persisted
    // (worker retry or completion sweep). Idempotent success, no duplicate.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ deduped: true, id }, { status: 200 });
    }
    console.error("[POST /api/internal/posts]", err);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 },
    );
  }
}
