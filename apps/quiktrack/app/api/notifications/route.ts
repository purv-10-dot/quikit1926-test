import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const PAGE_SIZE = 30;

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  try {
    const url = new URL(req.url);
    const tabParam = url.searchParams.get("tab");
    const tab = tabParam === "watching" || tabParam === "all" ? tabParam : "direct";
    const unreadOnly = url.searchParams.get("unread") === "1";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "", 10) || PAGE_SIZE, 1), 100);

    const where = {
      orgId,
      recipientId: userId,
      ...(tab === "all" ? {} : { tab }),
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const rows = await db.qtNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tab: true,
        type: true,
        actorId: true,
        projectId: true,
        issueId: true,
        issueKey: true,
        issueTitle: true,
        commentId: true,
        snippet: true,
        fromValue: true,
        toValue: true,
        isRead: true,
        readAt: true,
        createdAt: true,
      },
    });

    let nextCursor: string | null = null;
    let pageRows = rows;
    if (rows.length > limit) {
      pageRows = rows.slice(0, limit);
      nextCursor = pageRows[pageRows.length - 1]?.id ?? null;
    }

    const actorIds = Array.from(new Set(pageRows.map((r) => r.actorId).filter((x): x is string => Boolean(x))));
    const actors = actorIds.length
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const data = pageRows.map((r) => ({
      ...r,
      actor: r.actorId ? actorMap.get(r.actorId) ?? null : null,
    }));

    const [unreadDirect, unreadWatching] = await Promise.all([
      db.qtNotification.count({ where: { orgId, recipientId: userId, tab: "direct", isRead: false } }),
      db.qtNotification.count({ where: { orgId, recipientId: userId, tab: "watching", isRead: false } }),
    ]);

    return NextResponse.json({
      success: true,
      data,
      nextCursor,
      unread: { direct: unreadDirect, watching: unreadWatching, total: unreadDirect + unreadWatching },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
