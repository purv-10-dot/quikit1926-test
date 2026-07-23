import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { cacheGet, cacheSet } from "@quikit/redis";
const withOrgAuth = withOrgAuthForModule("analytics.trends");

// Short TTL: trends are expensive to compute but tolerate ~1min of staleness.
const TRENDS_TTL_SECONDS = 60;

export const GET = withOrgAuth(async ({ orgId }) => {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const years = [prevYear, currentYear];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  // Weekly KPI trend is scoped to the current quarter.
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const qLabel = `Q${currentQuarter}`;

  // Tenant-scoped cache key. Includes the year window + quarter so a rollover
  // (new year / new quarter) naturally misses the previous key.
  const cacheKey = `trends:${orgId}:${prevYear}-${currentYear}:${qLabel}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, data: JSON.parse(cached) });
  }

  // All four reads are independent → dispatch concurrently. Narrow `select`s
  // (no `include`) keep the payloads small: the aggregate reads only need the
  // scalar fields they group on; the current-quarter read only needs the
  // weekly values it charts.
  const [aggregateKpis, currentQKpis, priorities, qSetting] = await Promise.all([
    db.kPI.findMany({
      where: { orgId, year: { in: years } },
      select: { year: true, quarter: true, progressPercent: true },
    }),
    db.kPI.findMany({
      where: { orgId, year: currentYear, quarter: qLabel },
      select: { weeklyValues: { select: { weekNumber: true, value: true } } },
    }),
    db.priority.findMany({
      where: { orgId, year: { in: years } },
      select: { year: true, quarter: true, overallStatus: true },
    }),
    db.quarterSetting.findFirst({
      where: { orgId, fiscalYear: currentYear, quarter: qLabel },
      select: { weekCount: true },
    }),
  ]);

  const quarterlyData = years.flatMap((year) =>
    quarters.map((quarter) => {
      const qKpis = aggregateKpis.filter((k) => k.year === year && k.quarter === quarter);
      const qPriorities = priorities.filter(
        (p) => p.year === year && p.quarter === quarter,
      );
      const kpiAttainment =
        qKpis.length > 0
          ? Math.round(
              qKpis.reduce((s, k) => s + (k.progressPercent || 0), 0) /
                qKpis.length,
            )
          : null;
      const completed = qPriorities.filter(
        (p) => p.overallStatus === "completed",
      ).length;
      const priorityRate =
        qPriorities.length > 0
          ? Math.round((completed / qPriorities.length) * 100)
          : null;
      return {
        year,
        quarter,
        label: `${quarter} ${year}`,
        kpiAttainment,
        priorityRate,
        kpiCount: qKpis.length,
        priorityCount: qPriorities.length,
      };
    }),
  );

  // Custom Quarter Settings: size the weekly trend to the quarter's week count.
  const trendWeeks = qSetting?.weekCount ?? 13;
  const weeklyTrend = Array.from({ length: trendWeeks }, (_, i) => {
    const week = i + 1;
    const values = currentQKpis.flatMap((k) =>
      k.weeklyValues.filter((v) => v.weekNumber === week && v.value !== null),
    );
    return {
      week,
      avgValue:
        values.length > 0
          ? Math.round(
              values.reduce((s, v) => s + (v.value || 0), 0) / values.length,
            )
          : null,
      count: values.length,
    };
  });

  const data = { quarterlyData, weeklyTrend };

  // Best-effort write-back; degrades to a no-op when Redis is unavailable.
  await cacheSet(cacheKey, JSON.stringify(data), TRENDS_TTL_SECONDS);

  return NextResponse.json({ success: true, data });
});
