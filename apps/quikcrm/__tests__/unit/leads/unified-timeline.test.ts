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

  describe("Lead Converted event", () => {
    const baseInput = {
      activities: [],
      callLogs: [],
      notes: [],
      tasks: [],
      opportunities: [],
      documents: [],
    };

    it("surfaces a 'Lead Converted' item with account/contact/opportunity in the subtitle", () => {
      const items = buildUnifiedTimeline({
        ...baseInput,
        conversion: {
          convertedAt: "2026-05-30T10:00:00.000Z",
          ownerName: "Jain Sahab",
          accountName: "Sales Manager Account",
          contactName: "John Doe",
          opportunityName: "Sales Manager Account Deal",
        },
      });
      const conv = items.find((i) => i.kind === "conversion");
      expect(conv).toBeDefined();
      expect(conv!.title).toBe("Lead Converted");
      expect(conv!.subtitle).toBe(
        'Converted to Account "Sales Manager Account", Contact "John Doe", and Opportunity "Sales Manager Account Deal".',
      );
      expect(conv!.meta).toBe("Jain Sahab"); // user kept as-is
      expect(conv!.at).toBe("2026-05-30T10:00:00.000Z"); // timestamp kept as-is
    });

    it("appears first, above the Opportunity, when the opp is NOT suppressed", () => {
      const sameTs = "2026-05-30T10:00:00.000Z";
      const items = buildUnifiedTimeline({
        ...baseInput,
        opportunities: [
          { id: "opp1", name: "Sales Manager Account Deal", stage: "Prospecting", createdAt: sameTs },
        ],
        conversion: {
          convertedAt: sameTs,
          ownerName: null,
          accountName: "Acme",
          contactName: "Jane",
          opportunityName: "Sales Manager Account Deal",
        },
      });
      expect(items[0]?.kind).toBe("conversion");
      expect(items[0]?.title).toBe("Lead Converted");
      expect(items[1]?.kind).toBe("opportunity");
      expect(items[1]?.title).toBe("Sales Manager Account Deal");
    });

    it("hides the conversion-auto-created Opportunity when its id is suppressed (no duplicate)", () => {
      const sameTs = "2026-05-30T10:00:00.000Z";
      const items = buildUnifiedTimeline({
        ...baseInput,
        opportunities: [
          { id: "opp1", name: "Sales Manager Account Deal", stage: "Prospecting", createdAt: sameTs },
        ],
        conversion: {
          convertedAt: sameTs,
          ownerName: null,
          accountName: "Acme",
          contactName: "Jane",
          opportunityName: "Sales Manager Account Deal",
        },
        suppressOpportunityIds: ["opp1"],
      });
      // Only the conversion event remains; the opportunity item is gone.
      expect(items.filter((i) => i.kind === "opportunity")).toHaveLength(0);
      expect(items.filter((i) => i.kind === "conversion")).toHaveLength(1);
      expect(items[0]?.title).toBe("Lead Converted");
    });

    it("still shows OTHER opportunities linked to the lead (only the conversion opp is suppressed)", () => {
      const items = buildUnifiedTimeline({
        ...baseInput,
        opportunities: [
          { id: "opp-conv", name: "Conversion Deal", stage: "Prospecting", createdAt: "2026-05-30T10:00:00.000Z" },
          { id: "opp-manual", name: "Later Manual Deal", stage: "Qualification", createdAt: "2026-06-10T09:00:00.000Z" },
        ],
        conversion: {
          convertedAt: "2026-05-30T10:00:00.000Z",
          ownerName: null,
          accountName: "Acme",
          contactName: "Jane",
          opportunityName: "Conversion Deal",
        },
        suppressOpportunityIds: ["opp-conv"],
      });
      const oppItems = items.filter((i) => i.kind === "opportunity");
      expect(oppItems).toHaveLength(1);
      expect(oppItems[0]?.title).toBe("Later Manual Deal");
    });

    it("omits the conversion item entirely when no conversion is passed (unconverted lead)", () => {
      const items = buildUnifiedTimeline({
        ...baseInput,
        opportunities: [
          { id: "opp1", name: "Deal", stage: "Prospecting", createdAt: "2026-05-30T10:00:00.000Z" },
        ],
      });
      expect(items.some((i) => i.kind === "conversion")).toBe(false);
    });

    it("handles a single created record without a dangling 'and'", () => {
      const items = buildUnifiedTimeline({
        ...baseInput,
        conversion: {
          convertedAt: "2026-05-30T10:00:00.000Z",
          ownerName: null,
          accountName: "Acme",
          contactName: null,
          opportunityName: null,
        },
      });
      const conv = items.find((i) => i.kind === "conversion");
      expect(conv!.subtitle).toBe('Converted to Account "Acme".');
    });

    it("composes two records with 'and' (Account + Contact, no Opportunity)", () => {
      const items = buildUnifiedTimeline({
        ...baseInput,
        conversion: {
          convertedAt: "2026-05-30T10:00:00.000Z",
          ownerName: null,
          accountName: "Acme",
          contactName: "Jane",
          opportunityName: null,
        },
      });
      const conv = items.find((i) => i.kind === "conversion");
      expect(conv!.subtitle).toBe('Converted to Account "Acme", and Contact "Jane".');
    });
  });
});
