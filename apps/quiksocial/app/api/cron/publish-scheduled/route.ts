/**
 * GET /api/cron/publish-scheduled
 *
 * Triggered every minute by Vercel cron (vercel.json) or an external
 * system cron via HTTP GET with the correct CRON_SECRET header.
 *
 * Each tick does two things in order:
 *
 * 1. PUBLISH LOOP — atomic claim via raw SQL: `SELECT FOR UPDATE SKIP
 *    LOCKED` + `UPDATE ... RETURNING`. Two concurrent workers racing on
 *    the same row are guaranteed to pick different rows (or one gets
 *    nothing) without a distributed lock service. After claiming, the
 *    worker calls publishPost(), then writes the success/failure result
 *    via Prisma.
 *
 * 2. OVERDUE SWEEP — runs AFTER the publish loop. Any row still
 *    `status = scheduled` whose `scheduledFor` is older than
 *    (now - OVERDUE_GRACE_MS) flips to `overdue`. Per CLAUDE.md, overdue
 *    posts do NOT auto-publish — admin must reschedule or Post Now.
 *
 * Org scope: the cron sweeps ALL orgs in one tick. The FOR UPDATE SKIP
 * LOCKED claim and the overdue sweep carry no orgId predicate; each
 * claimed row's own `orgId` flows downstream to publishPost (and the
 * SocialAccount back-link), so every post publishes with ITS org's
 * credentials only — no cross-org leakage, no per-org loop needed.
 * Mirrors the production-proven standalone (per-row key, single sweep).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PostStatus } from "@/types/post-status";
import { publishPost } from "@/lib/meta/dispatch";

/** How long a lock is considered valid before it becomes stale and re-claimable. */
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Grace window before the post-publish sweep marks a still-scheduled row as overdue. */
const OVERDUE_GRACE_MS = 5 * 60 * 1000; // 5 minutes

interface ClaimedPostRow {
  id: string;
  orgId: string;
  brandId: string | null;
  createdBy: string | null;
  platform: string;
  content: string;
  imageUrls: string[];
  aiImageUrl: string | null;
  platformPostIds: Record<string, string> | null;
}

// All-orgs sweep: no orgId predicate — "still scheduled past the grace
// window" is org-agnostic; each row keeps its own orgId.
async function markOverduePosts(now: Date): Promise<number> {
  const overdueCutoff = new Date(now.getTime() - OVERDUE_GRACE_MS);
  const result = await db.post.updateMany({
    where: {
      status: PostStatus.Scheduled,
      scheduledFor: { lt: overdueCutoff },
    },
    data: { status: PostStatus.Overdue },
  });
  return result.count;
}

/**
 * Claim the next publishable post atomically via Postgres
 * `SELECT FOR UPDATE SKIP LOCKED`. Two workers cannot pick the same row.
 */
async function claimNextPost(now: Date): Promise<ClaimedPostRow | null> {
  const staleLockCutoff = new Date(now.getTime() - LOCK_TTL_MS);

  // All-orgs claim: no orgId predicate. FOR UPDATE SKIP LOCKED still
  // guarantees two workers never grab the same row; the claimed row's own
  // orgId (in RETURNING) flows downstream so dispatch stays org-scoped.
  const rows = await db.$queryRaw<ClaimedPostRow[]>(Prisma.sql`
    WITH next AS (
      SELECT id
      FROM "app_quiksocial"."Post"
      WHERE status = 'scheduled'
        AND "scheduledFor" <= ${now}
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockCutoff})
      ORDER BY "scheduledFor" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "app_quiksocial"."Post" p
    SET "lockedAt" = ${now}
    FROM next
    WHERE p.id = next.id
    RETURNING
      p.id,
      p."orgId",
      p."brandId",
      p."createdBy",
      p.platform,
      p.content,
      p."imageUrls",
      p."aiImageUrl",
      p."platformPostIds";
  `);

  return rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  // --- Auth ---
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/publish-scheduled] CRON_SECRET env var is not set");
    return NextResponse.json(
      { success: false, error: "Cron not configured", code: "CRON_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const now = new Date();
  const results = {
    overdueMarked: 0,
    published: 0,
    failed: 0,
    postIds: {
      published: [] as string[],
      failed: [] as string[],
    },
  };

  // --- Step 1: Publish loop ---
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    let post: ClaimedPostRow | null = null;
    try {
      post = await claimNextPost(now);
    } catch (err) {
      console.error("[cron/publish-scheduled] Failed to claim post:", err);
      break;
    }

    if (!post) break;

    try {
      const dispatch = await publishPost({
        orgId: post.orgId,
        brandId: post.brandId,
        userId: post.createdBy,
        platform: post.platform,
        content: post.content,
        imageUrls: post.imageUrls,
        aiImageUrl: post.aiImageUrl,
      });

      if (dispatch.success && dispatch.mediaId) {
        const platformPostIds = {
          ...(post.platformPostIds ?? {}),
          [dispatch.platform]: dispatch.mediaId,
        };

        // Best-effort: link the SocialAccount that published this post so the
        // auto-reply monitor (monitor-batch filters posts by socialAccountId)
        // can find it. Scoped to the post's OWN org. Only link when exactly
        // one active account matches — never guess. A lookup failure must NOT
        // fail the publish (the post DID publish).
        let resolvedSocialAccountId: string | null = null;
        if (post.brandId) {
          try {
            const candidates = await db.socialAccount.findMany({
              where: {
                orgId: post.orgId,
                brandId: post.brandId,
                platform: dispatch.platform,
                isActive: true,
              },
              select: { id: true },
              take: 2, // only need to distinguish 1 from >1
            });
            if (candidates.length === 1) {
              resolvedSocialAccountId = candidates[0].id;
            } else if (candidates.length > 1) {
              console.warn(
                `[cron/publish-scheduled] Post ${post.id}: ${candidates.length} active ${dispatch.platform} accounts for brand ${post.brandId} — leaving socialAccountId null`,
              );
            }
          } catch (lookupErr) {
            console.warn(
              `[cron/publish-scheduled] Post ${post.id}: SocialAccount lookup failed`,
              lookupErr,
            );
          }
        }

        await db.post.update({
          where: { id: post.id },
          data: {
            status: PostStatus.Published,
            publishedAt: new Date(),
            publishedMediaId: dispatch.mediaId,
            permalink: dispatch.permalink ?? null,
            platformPostIds,
            failedReason: null,
            lockedAt: null,
            // Spread-only-when-resolved — never wipe an existing link on a
            // re-publish where the lookup fails or returns 0 candidates.
            ...(resolvedSocialAccountId
              ? { socialAccountId: resolvedSocialAccountId }
              : {}),
          },
        });

        results.published++;
        results.postIds.published.push(post.id);
        console.log(
          `[cron/publish-scheduled] Published post ${post.id} on ${dispatch.platform} (${dispatch.mediaId})`,
        );
      } else {
        const reason = dispatch.error ?? "Publish returned no media ID";
        console.error(
          `[cron/publish-scheduled] Failed to publish ${post.id} on ${dispatch.platform}: ${reason}`,
        );
        await db.post.update({
          where: { id: post.id },
          data: {
            status: PostStatus.Failed,
            failedReason: reason,
            lockedAt: null,
          },
        });
        results.failed++;
        results.postIds.failed.push(post.id);
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[cron/publish-scheduled] Unexpected throw publishing post ${post.id}:`,
        err,
      );
      await db.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.Failed,
          failedReason: reason,
          lockedAt: null,
        },
      });
      results.failed++;
      results.postIds.failed.push(post.id);
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn(
      `[cron/publish-scheduled] Hit iteration cap (${MAX_ITERATIONS}) — possible backlog`,
    );
  }

  // --- Step 2: Overdue sweep ---
  try {
    results.overdueMarked = await markOverduePosts(now);
    if (results.overdueMarked > 0) {
      console.log(
        `[cron/publish-scheduled] Marked ${results.overdueMarked} post(s) as overdue`,
      );
    }
  } catch (err) {
    console.error("[cron/publish-scheduled] Overdue sweep failed:", err);
  }

  return NextResponse.json({
    success: true,
    data: {
      timestamp: now.toISOString(),
      overdueMarked: results.overdueMarked,
      published: results.published,
      failed: results.failed,
      postIds: results.postIds,
    },
  });
}
