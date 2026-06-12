import { describe, expect, it } from "vitest";
import {
  buildUnifiedTimeline,
  filterTimeline,
  groupTimelineByDate,
} from "@/lib/services/leads/unified-timeline";

describe("unified-timeline", () => {
  it("merges and sorts events newest first", () => {
    const items = buildUnifiedTimeline({
      activities: [
        {
          id: "a1",
          type: "LeadStageChange",
          subject: "Stage",
          outcome: null,
          ownerName: null,
          occurredAt: "2026-05-20T10:00:00.000Z",
          createdAt: "2026-05-20T10:00:00.000Z",
          activityCode: "stage_change",
        },
      ],
      callLogs: [
        {
          id: "c1",
          direction: "outbound",
          status: "completed",
          durationSec: 60,
          startTime: "2026-05-25T10:00:00.000Z",
          createdAt: "2026-05-25T10:00:00.000Z",
        },
      ],
      notes: [],
      tasks: [],
      opportunities: [],
      documents: [],
    });
    expect(items[0]?.kind).toBe("call");
    expect(filterTimeline(items, "calls")).toHaveLength(1);
    expect(groupTimelineByDate(items).length).toBeGreaterThan(0);
  });

  it("shows creator name on system lead activities when ownerName is set", () => {
    const items = buildUnifiedTimeline({
      activities: [
        {
          id: "a3",
          type: "LeadCreated",
          subject: "Lead added manually",
          outcome: "Website",
          ownerName: "Jain Sahab",
          occurredAt: "2026-05-29T05:25:00.000Z",
          createdAt: "2026-05-29T05:25:00.000Z",
          activityCode: "lead_system",
        },
      ],
      callLogs: [],
      notes: [],
      tasks: [],
      opportunities: [],
      documents: [],
    });
    expect(items[0]?.meta).toBe("Jain Sahab");
  });

  it("uses detailNotes for call disposition subtitle and skips duplicate outcome", () => {
    const items = buildUnifiedTimeline({
      activities: [
        {
          id: "a2",
          type: "Call",
          subject: "Call · Demo Scheduled",
          outcome: "Demo Scheduled",
          ownerName: "Ashwin Singh",
          occurredAt: "2026-05-28T10:40:00.000Z",
          createdAt: "2026-05-28T10:40:00.000Z",
          detailNotes: "Duration: 120s\nStatus: Demo Booked\nNotes: Client interested",
        },
      ],
      callLogs: [],
      notes: [],
      tasks: [],
      opportunities: [],
      documents: [],
    });
    expect(items[0]?.title).toBe("Call · Demo Scheduled");
    expect(items[0]?.subtitle).toContain("Duration: 120s");
    expect(items[0]?.subtitle).not.toBe("Demo Scheduled");
    expect(items[0]?.meta).toBe("Ashwin Singh");
  });
});
