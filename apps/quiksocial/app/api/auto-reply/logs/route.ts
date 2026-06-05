/**
 * GET /api/auto-reply/logs?brandId=&ruleId=&limit=&offset=
 *
 * Paginated audit feed. brandId filter joins through rule.brandId.
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ListLogsQuerySchema } from "@/lib/auto-reply/types";

export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = ListLogsQuerySchema.safeParse({
    brandId: searchParams.get("brandId") ?? undefined,
    ruleId: searchParams.get("ruleId") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query" },
      { status: 422 },
    );
  }
  const { brandId, ruleId, limit, offset } = parsed.data;

  const where = {
    orgId,
    ...(ruleId ? { ruleId } : {}),
    ...(brandId ? { rule: { brandId } } : {}),
  };

  // Phase 1B: the dashboard's Activity tab needs the rule's name, the
  // platform, and the post's title/content snippet to render each entry
  // as a readable conversation thread. Flattened into top-level fields
  // on the response so the UI doesn't have to walk a nested shape.
  const [logsRaw, total] = await Promise.all([
    db.autoReplyLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        rule: { select: { name: true } },
        socialAccount: { select: { platform: true } },
        post: { select: { title: true, content: true } },
      },
    }),
    db.autoReplyLog.count({ where }),
  ]);

  const logs = logsRaw.map((l) => {
    const { rule, socialAccount, post, ...base } = l;
    return {
      ...base,
      ruleName: rule?.name ?? null,
      platform: socialAccount?.platform ?? null,
      // Post.title is often null for FB/IG posts; fall back to a short
      // content snippet so the UI always has something to render.
      postTitle:
        post?.title ??
        (post?.content ? post.content.slice(0, 80) : null),
    };
  });

  return NextResponse.json({
    success: true,
    data: { logs, total, hasMore: offset + logs.length < total },
  });
});
