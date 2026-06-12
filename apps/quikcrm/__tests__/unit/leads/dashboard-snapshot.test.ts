import { describe, expect, it } from "vitest";
import { buildLeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";

describe("buildLeadDashboardSnapshot", () => {
  const now = new Date("2026-05-25T12:00:00.000Z");

  it("counts open vs completed tasks and picks next follow-up", () => {
    const snap = buildLeadDashboardSnapshot({
      createdAt: "2026-05-20T00:00:00.000Z",
      tasks: [
        { status: "Open" },
        { status: "Completed" },
        { status: "InProgress" },
      ],
      activities: [
        { followUpAt: "2026-05-24T00:00:00.000Z" },
        { followUpAt: "2026-05-28T10:00:00.000Z" },
      ],
      notes: [{}],
      opportunities: [{}, {}],
      callLogs: [{}],
      attachments: [],
      slaTracking: [],
      now,
    });

    expect(snap.openTasks).toBe(2);
    expect(snap.completedTasks).toBe(1);
    expect(snap.daysSinceCreated).toBe(5);
    expect(snap.nextFollowUpAt).toBe("2026-05-28T10:00:00.000Z");
    expect(snap.notesCount).toBe(1);
    expect(snap.opportunitiesCount).toBe(2);
    expect(snap.emailsCount).toBe(0);
    expect(snap.trends).toBeDefined();
  });

  it("surfaces SLA breach-style alerts", () => {
    const snap = buildLeadDashboardSnapshot({
      createdAt: now,
      tasks: [],
      activities: [],
      notes: [],
      opportunities: [],
      callLogs: [],
      attachments: [],
      slaTracking: [
        { ruleName: "First touch", status: "breached", breachAt: now },
        { ruleName: "Follow-up", status: "ok", breachAt: null },
      ],
      now,
    });

    expect(snap.slaAlerts).toHaveLength(1);
    expect(snap.slaAlerts[0]?.ruleName).toBe("First touch");
  });
});
