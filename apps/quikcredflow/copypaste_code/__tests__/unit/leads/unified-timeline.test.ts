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
});
