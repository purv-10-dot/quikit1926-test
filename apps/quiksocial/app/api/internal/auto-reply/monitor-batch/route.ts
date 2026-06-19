/**
 * POST /api/internal/auto-reply/monitor-batch
 *
 * Called by the Python monitor task. Returns everything needed for one
 * polling round on one (orgId, socialAccountId). Bundles posts, rules,
 * per-post cursors, and a 24h SENT-log snapshot so the monitor can compute
 * cooldown / daily-cap checks locally without further round trips.
 *
 * Auth: X-QS-Internal-Token.
 *
 * Post selection mirrors v1 — most-recent N published posts, no time
 * window. Env override: AUTO_REPLY_MAX_POSTS_PER_ACCOUNT (default 100).
 *
 * Accepts both `orgId` (canonical) and `tenantId` (legacy wire-format
 * from the Python service).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkInternalToken } from "@/lib/auto-reply/internal-auth";
import {
  MonitorBatchRequestSchema,
  resolveOrgId,
  type MonitorBatchResponse,
} from "@/lib/auto-reply/types";

const DEFAULT_POST_LIMIT = 100;

/** Pull the Graph media ID for `platform` out of a Post.platformPostIds blob.
 *  Handles both the simple string form (current v2 writer) and the legacy
 *  object form `{ postId, socialAccountId, accountId }` v1 sometimes wrote. */
function extractPlatformPostId(
  raw: unknown,
  platform: string,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[platform];
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object" && value !== null) {
    const pid = (value as { postId?: unknown }).postId;
    if (typeof pid === "string" && pid.trim()) return pid.trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authFail = checkInternalToken(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  const parsed = MonitorBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { socialAccountId } = parsed.data;
  const orgId = resolveOrgId(parsed.data);
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 422 },
    );
  }

  const socialAccount = await db.socialAccount.findFirst({
    where: { id: socialAccountId, orgId, isActive: true },
  });
  if (!socialAccount) {
    return NextResponse.json({ error: "SocialAccount not found or inactive" }, { status: 404 });
  }

  // Phase 2 — platform-level master switch. When off, return a
  // `platformDisabled: true` response with empty arrays so the Python
  // monitor short-circuits before any Graph polling. The socialAccount
  // block is still echoed for log diagnostics; access tokens are
  // intentionally NOT included since no Graph call will be made.
  if (!socialAccount.autoReplyEnabled) {
    return NextResponse.json({
      platformDisabled: true,
      socialAccount: {
        id: socialAccount.id,
        platform: socialAccount.platform,
        accountId: socialAccount.accountId,
        pageId: socialAccount.pageId,
        accessToken: "",
        tokenExpiresAt: null,
      },
      posts: [],
      rules: [],
      cursorsByPostId: {},
      recentSends: [],
    });
  }

  const postLimit = Math.max(
    1,
    Number(process.env.AUTO_REPLY_MAX_POSTS_PER_ACCOUNT) || DEFAULT_POST_LIMIT,
  );

  // Match v1: most-recent N published, no time filter (Q4 approved).
  const postsRaw = await db.post.findMany({
    where: {
      orgId,
      socialAccountId,
      status: "published",
    },
    orderBy: { publishedAt: "desc" },
    take: postLimit,
    select: {
      id: true,
      publishedAt: true,
      platformPostIds: true,
    },
  });

  const posts: MonitorBatchResponse["posts"] = [];
  const postIdToPlatformId = new Map<string, string>();
  for (const p of postsRaw) {
    const platformPostId = extractPlatformPostId(p.platformPostIds, socialAccount.platform);
    if (!platformPostId) continue;
    postIdToPlatformId.set(p.id, platformPostId);
    posts.push({
      id: p.id,
      platformPostId,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      autoReplyEnabled: true, // overwritten below if a control row says otherwise
    });
  }

  // Apply per-post overrides where they exist.
  if (posts.length > 0) {
    const controls = await db.autoReplyPostControl.findMany({
      where: { orgId, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, autoReplyEnabled: true },
    });
    const controlByPostId = new Map(controls.map((c) => [c.postId, c.autoReplyEnabled]));
    for (const p of posts) {
      const flag = controlByPostId.get(p.id);
      if (flag !== undefined) p.autoReplyEnabled = flag;
    }
  }

  // All active rules for this (org, social account).
  const rulesRaw = await db.autoReplyRule.findMany({
    where: { orgId, socialAccountId, isActive: true },
  });
  const rules: MonitorBatchResponse["rules"] = rulesRaw.map((r) => ({
    id: r.id,
    brandId: r.brandId,
    name: r.name,
    triggerType: r.triggerType,
    replyMode: r.replyMode,
    priority: r.priority,
    templateBody: r.templateBody,
    keywords: r.keywords,
    keywordMatch: r.keywordMatch,
    caseSensitive: r.caseSensitive,
    toneGuidance: r.toneGuidance,
    cooldownMinutes: r.cooldownMinutes,
    maxRepliesPerDay: r.maxRepliesPerDay,
    updatedAt: r.updatedAt.toISOString(),
  }));

  // Cursors for every post we're about to poll.
  const cursorsByPostId: MonitorBatchResponse["cursorsByPostId"] = {};
  if (posts.length > 0) {
    const cursors = await db.autoReplyCursor.findMany({
      where: {
        orgId,
        socialAccountId,
        postId: { in: posts.map((p) => p.id) },
      },
      select: {
        postId: true,
        lastCommentTimestamp: true,
        consecutiveErrors: true,
      },
    });
    for (const c of cursors) {
      cursorsByPostId[c.postId] = {
        lastCommentTimestamp: c.lastCommentTimestamp
          ? c.lastCommentTimestamp.toISOString()
          : null,
        consecutiveErrors: c.consecutiveErrors,
      };
    }
  }

  // 24h SENT snapshot for cooldown + daily-cap derivation in Python.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSendsRaw =
    rules.length > 0
      ? await db.autoReplyLog.findMany({
          where: {
            orgId,
            socialAccountId,
            status: "SENT",
            sentAt: { gte: since },
            ruleId: { in: rules.map((r) => r.id) },
          },
          select: { ruleId: true, commentAuthorId: true, sentAt: true },
          orderBy: { sentAt: "desc" },
          take: 2000,
        })
      : [];
  const recentSends: MonitorBatchResponse["recentSends"] = recentSendsRaw.map((l) => ({
    ruleId: l.ruleId,
    commentAuthorId: l.commentAuthorId,
    sentAt: l.sentAt.toISOString(),
  }));

  const response: MonitorBatchResponse = {
    socialAccount: {
      id: socialAccount.id,
      platform: socialAccount.platform,
      accountId: socialAccount.accountId,
      pageId: socialAccount.pageId,
      accessToken: socialAccount.accessToken,
      tokenExpiresAt: socialAccount.expiresAt ? socialAccount.expiresAt.toISOString() : null,
    },
    posts,
    rules,
    cursorsByPostId,
    recentSends,
  };

  return NextResponse.json(response);
}
