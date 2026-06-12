/**
 * Derived 14-day trends for account 360 (no historical snapshots yet — modeled from CRM signals).
 */

export interface AccountScorePoint {
  label: string;
  iso: string;
  value: number;
}

export interface AccountScoreHistoryBundle {
  healthTrend: AccountScorePoint[];
  engagementTrend: AccountScorePoint[];
  revenueTrend: AccountScorePoint[];
  currentHealth: number;
  currentEngagement: number;
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

export function buildAccountScoreHistory(input: {
  healthScore: number | null;
  activities: Dated[];
  calls: Dated[];
  notes: Dated[];
  opportunities: { amount: unknown; updatedAt: Date | string | null; stage: string }[];
  now?: Date;
  days?: number;
}): AccountScoreHistoryBundle {
  const now = input.now ?? new Date();
  const days = input.days ?? 14;
  const buckets = lastNDays(days, now);
  const touchCounts = new Map(buckets.map((b) => [b.iso, 0]));
  const revenueByDay = new Map(buckets.map((b) => [b.iso, 0]));

  const bump = (at: Date | string | null) => {
    if (!at) return;
    const iso = dayKey(new Date(at));
    if (touchCounts.has(iso)) touchCounts.set(iso, (touchCounts.get(iso) ?? 0) + 1);
  };

  for (const a of input.activities) bump(a.at);
  for (const c of input.calls) bump(c.at);
  for (const n of input.notes) bump(n.at);

  for (const o of input.opportunities) {
    if (!/won/i.test(o.stage)) continue;
    const iso = dayKey(new Date(o.updatedAt ?? now));
    if (!revenueByDay.has(iso)) continue;
    const amt = o.amount != null ? Number(o.amount) : 0;
    if (Number.isFinite(amt)) revenueByDay.set(iso, (revenueByDay.get(iso) ?? 0) + amt);
  }

  const baseHealth = input.healthScore ?? 50;
  const currentEngagement = Math.min(
    100,
    [...touchCounts.values()].reduce((s, v) => s + v, 0) * 8 +
      input.calls.length * 4,
  );

  const healthTrend = buckets.map((b, i) => {
    const touches = touchCounts.get(b.iso) ?? 0;
    const drift = touches * 3 - (i > 0 && touches === 0 ? 2 : 0);
    const value = Math.max(0, Math.min(100, Math.round(baseHealth * (0.85 + i * 0.01) + drift)));
    return { ...b, value };
  });

  const engagementTrend = buckets.map((b) => ({
    ...b,
    value: Math.min(100, (touchCounts.get(b.iso) ?? 0) * 18),
  }));

  const maxRev = Math.max(1, ...revenueByDay.values());
  const revenueTrend = buckets.map((b) => ({
    ...b,
    value: Math.round(((revenueByDay.get(b.iso) ?? 0) / maxRev) * 100),
  }));

  return {
    healthTrend,
    engagementTrend,
    revenueTrend,
    currentHealth: healthTrend[healthTrend.length - 1]?.value ?? baseHealth,
    currentEngagement,
  };
}
