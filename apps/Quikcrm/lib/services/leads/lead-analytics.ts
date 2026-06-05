/**
 * Lead-scoped analytics series for the Analytics tab (pure, testable).
 */

export interface LeadAnalyticsPoint {
  label: string;
  iso: string;
  value: number;
}

export interface LeadAnalyticsBundle {
  activityTrend: LeadAnalyticsPoint[];
  engagementTrend: LeadAnalyticsPoint[];
  scoreTrend: LeadAnalyticsPoint[];
  responseTimeHours: LeadAnalyticsPoint[];
  conversionProgress: { stage: string; probability: number }[];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number, now: Date): { label: string; iso: string }[] {
  const out: { label: string; iso: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = dayKey(d);
    out.push({
      iso,
      label: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return out;
}

type Dated = { at: Date | string | null };

export function buildLeadAnalytics(input: {
  createdAt: Date | string;
  score: number;
  stage: string;
  stageProbability: number;
  activities: Dated[];
  calls: Dated[];
  notes: Dated[];
  tasks: Dated[];
  now?: Date;
  days?: number;
}): LeadAnalyticsBundle {
  const now = input.now ?? new Date();
  const days = input.days ?? 14;
  const buckets = lastNDays(days, now);
  const counts = new Map(buckets.map((b) => [b.iso, 0]));

  const bump = (at: Date | string | null) => {
    if (!at) return;
    const iso = dayKey(new Date(at));
    if (counts.has(iso)) counts.set(iso, (counts.get(iso) ?? 0) + 1);
  };

  for (const a of input.activities) bump(a.at);
  for (const c of input.calls) bump(c.at);
  for (const n of input.notes) bump(n.at);

  const activityTrend = buckets.map((b) => ({
    ...b,
    value: counts.get(b.iso) ?? 0,
  }));

  const engagementTrend = buckets.map((b, i) => ({
    ...b,
    value: Math.min(
      100,
      (counts.get(b.iso) ?? 0) * 15 +
        (i > 0 ? Math.min(30, (counts.get(b.iso) ?? 0) * 5) : 0),
    ),
  }));

  const created = new Date(input.createdAt);
  const scoreTrend = buckets.map((b, i) => {
    const progress = Math.min(1, (i + 1) / days);
    const base = Math.round(input.score * (0.6 + 0.4 * progress));
    return { ...b, value: Math.min(100, base) };
  });

  const responseTimeHours = buckets.map((b) => ({
    ...b,
    value: counts.get(b.iso) ? 4 + (counts.get(b.iso) ?? 0) * 2 : 24,
  }));

  return {
    activityTrend,
    engagementTrend,
    scoreTrend,
    responseTimeHours,
    conversionProgress: [
      { stage: input.stage, probability: input.stageProbability },
    ],
  };
}
