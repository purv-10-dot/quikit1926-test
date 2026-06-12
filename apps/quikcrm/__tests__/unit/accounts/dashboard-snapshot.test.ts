import { describe, expect, it } from "vitest";
import { buildAccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";

describe("buildAccountDashboardSnapshot", () => {
  const now = new Date("2026-05-26T12:00:00.000Z");

  it("sums open pipeline excluding closed stages", () => {
    const snapshot = buildAccountDashboardSnapshot({
      renewalDate: null,
      opportunities: [
        { stage: "Prospecting", amount: 100_000 },
        { stage: "ClosedWon", amount: 50_000, updatedAt: now },
        { stage: "Negotiation", amount: 200_000 },
      ],
      quotes: [],
      tasks: [],
      activities: [],
      callLogs: [],
      notes: [],
      attachments: [],
      contacts: [],
      leads: [],
      now,
    });
    expect(snapshot.openPipeline).toBe(300_000);
    expect(snapshot.wonRevenue12mo).toBe(50_000);
  });

  it("flags renewal within 30 days as urgent", () => {
    const renewal = new Date(now);
    renewal.setDate(renewal.getDate() + 20);
    const snapshot = buildAccountDashboardSnapshot({
      renewalDate: renewal,
      opportunities: [],
      quotes: [],
      tasks: [],
      activities: [],
      callLogs: [],
      notes: [],
      attachments: [],
      contacts: [{ id: "1" }],
      leads: [],
      now,
    });
    expect(snapshot.renewalAlert).toBe("urgent");
    expect(snapshot.contactsCount).toBe(1);
  });

  it("marks touch as stale when last activity is older than 30 days", () => {
    const old = new Date(now);
    old.setDate(old.getDate() - 45);
    const snapshot = buildAccountDashboardSnapshot({
      renewalDate: null,
      opportunities: [],
      quotes: [],
      tasks: [],
      activities: [{ occurredAt: old, createdAt: old }],
      callLogs: [],
      notes: [],
      attachments: [],
      contacts: [],
      leads: [],
      now,
    });
    expect(snapshot.isStaleTouch).toBe(true);
  });
});
