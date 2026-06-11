import { describe, expect, it } from "vitest";
import { buildAccountScoreHistory } from "@/lib/services/accounts/account-score-history";

describe("buildAccountScoreHistory", () => {
  it("returns 14-day trend series", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    const bundle = buildAccountScoreHistory({
      healthScore: 72,
      activities: [{ at: "2026-05-25T10:00:00Z" }],
      calls: [],
      notes: [],
      opportunities: [],
      now,
    });
    expect(bundle.healthTrend).toHaveLength(14);
    expect(bundle.engagementTrend).toHaveLength(14);
    expect(bundle.revenueTrend).toHaveLength(14);
    expect(bundle.currentHealth).toBeGreaterThan(0);
  });
});
