/**
 * GET /api/dashboard/stats
 *
 * Returns the brand-level dashboard widgets: total/scheduled/published
 * post counts, this-week count + WoW change, platform distribution
 * (donut), and 6-week velocity (line chart).
 *
 * Ported to QuikIT (Phase 3, Batch 5):
 *   - withOrgAuth wrapper — orgId from session, NOT DEFAULT_ORG_ID
 *   - activeBrandId resolved from UserPreference (no session leak)
 *   - { success, data } envelope
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildEmptyVelocity() {
  return Array.from({ length: 6 }, (_, i) => ({
    week: `W${i + 1}`,
    created: 0,
    published: 0,
  }));
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  twitter: "#000000",
  x: "#000000",
  youtube: "#FF0000",
  google_business: "#4285F4",
  google: "#4285F4",
  tiktok: "#010101",
};

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  // Active brand from UserPreference. (session.user.activeBrandId was a
  // legacy single-app session leak — gone in QuikIT.)
  const pref = await db.userPreference.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { activeBrandId: true },
  });
  const brandId = pref?.activeBrandId ?? null;

  if (!brandId) {
    return NextResponse.json({
      success: true,
      data: {
        totalPosts: 0,
        scheduledPosts: 0,
        publishedPosts: 0,
        thisWeekPosts: 0,
        percentChange: 0,
        platformDistribution: [],
        weeklyVelocity: buildEmptyVelocity(),
      },
    });
  }

  const now = new Date();
  const mondayThisWeek = getMondayOf(now);
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setDate(mondayLastWeek.getDate() - 7);

  const weekRanges: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - (i + 1) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    weekRanges.push({ label: `W${6 - i}`, start, end });
  }

  const baseWhere = { orgId, brandId } as const;

  const [
    totalPosts,
    scheduledPosts,
    publishedPosts,
    thisWeekPosts,
    lastWeekPosts,
    platformGroups,
    ...velocityResults
  ] = await Promise.all([
    db.post.count({ where: baseWhere }),
    db.post.count({ where: { ...baseWhere, status: "scheduled" } }),
    db.post.count({ where: { ...baseWhere, status: "published" } }),
    db.post.count({
      where: { ...baseWhere, createdAt: { gte: mondayThisWeek } },
    }),
    db.post.count({
      where: {
        ...baseWhere,
        createdAt: { gte: mondayLastWeek, lt: mondayThisWeek },
      },
    }),
    db.post.groupBy({
      by: ["platform"],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
    // velocity — 2 counts per week (created + published), 12 total
    ...weekRanges.flatMap((w) => [
      db.post.count({
        where: { ...baseWhere, createdAt: { gte: w.start, lte: w.end } },
      }),
      db.post.count({
        where: {
          ...baseWhere,
          status: "published",
          publishedAt: { gte: w.start, lte: w.end },
        },
      }),
    ]),
  ]);

  const percentChange =
    lastWeekPosts === 0
      ? thisWeekPosts > 0
        ? 100
        : 0
      : Math.round(((thisWeekPosts - lastWeekPosts) / lastWeekPosts) * 100);

  const totalForPct = platformGroups.reduce(
    (s, p) => s + (p._count._all ?? 0),
    0,
  );
  const platformDistribution = platformGroups.map((p) => {
    const count = p._count._all ?? 0;
    return {
      platform: p.platform as string,
      count,
      pct: totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0,
      color: PLATFORM_COLORS[(p.platform as string)?.toLowerCase()] ?? "#6B7280",
    };
  });

  const weeklyVelocity = weekRanges.map((w, i) => ({
    week: w.label,
    created: velocityResults[i * 2] as number,
    published: velocityResults[i * 2 + 1] as number,
  }));

  return NextResponse.json({
    success: true,
    data: {
      totalPosts,
      scheduledPosts,
      publishedPosts,
      thisWeekPosts,
      percentChange,
      platformDistribution,
      weeklyVelocity,
    },
  });
});
