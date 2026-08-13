import { prisma } from "@/lib/prisma";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { generateInsights } from "@/lib/insights/generator";
import type { InsightsReport } from "@/lib/insights/types";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export function frequencyToDays(freq: Frequency): number {
  switch (freq) {
    case "DAILY":
      return 1;
    case "MONTHLY":
      return 30;
    case "WEEKLY":
    default:
      return 7;
  }
}

export function frequencyLabel(freq: Frequency): string {
  return { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" }[freq];
}

function periodLabel(days: number, now: Date): string {
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(now)}, ${now.getFullYear()}`;
}

/**
 * Builds the full insights report for a single user in ONE aggregation pass.
 * `getAggregatedDashboard` fans out to every connected platform internally, so
 * this is the single data call the whole email is generated from — no per-section
 * or per-platform round trips, and no AI.
 *
 * Returns `report.empty === true` when the user has no connected platforms, so
 * callers can skip sending.
 */
export async function buildReportForUser(
  userId: string,
  frequency: Frequency,
  now: Date = new Date()
): Promise<InsightsReport> {
  const connections = await prisma.platformConnection.findMany({
    where: { userId, status: "CONNECTED" },
    select: { platform: true },
  });
  const connected = new Set(connections.map((c) => c.platform as string));

  const days = frequencyToDays(frequency);

  // No connected platforms → nothing to generate. Skip the (expensive) fan-out.
  if (connected.size === 0) {
    return {
      periodLabel: periodLabel(days, now),
      frequencyLabel: frequencyLabel(frequency),
      generatedAt: now.toISOString(),
      sections: [],
      overallSummary: "No platforms are connected yet, so there is nothing to report.",
      empty: true,
    };
  }

  const data = await getAggregatedDashboard(userId, days);

  return generateInsights(data, connected, {
    periodLabel: periodLabel(days, now),
    frequencyLabel: frequencyLabel(frequency),
    generatedAt: now.toISOString(),
  });
}
