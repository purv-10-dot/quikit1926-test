import { describe, expect, it } from "vitest";
import { buildUnifiedTimeline } from "@/lib/services/leads/unified-timeline";

describe("buildUnifiedTimeline — lead system activities", () => {
  it("classifies lead_system activities and uses subject as title", () => {
    const items = buildUnifiedTimeline({
      activities: [
        {
          id: "a1",
          type: "LeadCreated",
          subject: "Lead created from Website",
          outcome: "Website",
          ownerName: "Ashwin Singh",
          occurredAt: "2026-05-26T10:00:00.000Z",
          createdAt: "2026-05-26T10:00:00.000Z",
          activityCode: "lead_system",
          detailNotes: "[System]\n\nLead created",
        },
      ],
      callLogs: [],
      notes: [],
      tasks: [],
      opportunities: [],
      documents: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("system");
    expect(items[0]!.title).toBe("Lead created from Website");
    expect(items[0]!.meta).toBe("System");
  });
});
