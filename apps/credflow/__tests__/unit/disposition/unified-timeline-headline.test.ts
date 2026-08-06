/**
 * FR-RE Stage 3-D(c) — the Timeline tab must represent an event identically to
 * the Call Disposition tab. The Call Disposition renderer composes activity
 * titles via activityHeadline; buildUnifiedTimeline (Timeline tab) composes its
 * own ("subject || type", no type prefix, no Call special-case, outcome dropped
 * to subtitle). Same event -> two different titles. This locks them to ONE
 * composer: buildUnifiedTimeline's activity title === activityHeadline(activity).
 *
 * RED until buildUnifiedTimeline routes its non-system activity title through
 * activityHeadline.
 */
import { describe, it, expect } from "vitest";
import { buildUnifiedTimeline } from "@/lib/services/leads/unified-timeline";
import { activityHeadline } from "@/lib/utils/activity-headline";

const EMPTY = { callLogs: [], notes: [], tasks: [], opportunities: [], documents: [] };

function titleFor(activity: {
  type: string;
  subject: string | null;
  outcome: string | null;
}): string {
  const items = buildUnifiedTimeline({
    ...EMPTY,
    activities: [
      {
        id: "a1",
        type: activity.type,
        subject: activity.subject,
        outcome: activity.outcome,
        ownerName: "Admin User",
        occurredAt: "2026-06-02T05:48:00.000Z",
        createdAt: "2026-06-02T05:48:00.000Z",
        activityCode: null,
        detailNotes: null,
      },
    ],
  });
  return items[0].title;
}

describe("buildUnifiedTimeline — activity title matches activityHeadline (3-D(c))", () => {
  // Both tabs must agree: the Timeline tab's title === activityHeadline (the
  // composer the Call Disposition tab now also uses).
  it("Call entry: clean 'Call Disposition - <Status>', no type prefix", () => {
    const a = { type: "Call", subject: "Call Disposition - Renewal Done", outcome: "" };
    expect(titleFor(a)).toBe(activityHeadline(a)); // tabs agree
    expect(titleFor(a)).toBe("Call Disposition - Renewal Done"); // clean target
  });

  it("LeadStageChange entry: clean 'Disposition update · <Status>', no type prefix", () => {
    const a = { type: "LeadStageChange", subject: "Disposition update · Renewal Done", outcome: "" };
    expect(titleFor(a)).toBe(activityHeadline(a)); // tabs agree
    expect(titleFor(a)).toBe("Disposition update · Renewal Done"); // clean target — no "LeadStageChange ·"
  });

  // Option B containment: every OTHER type still renders "type · subject ·
  // outcome". If someone later makes subject-first universal, this FAILS.
  it("non-disposition types keep 'type · subject · outcome' (containment lock)", () => {
    const email = { type: "Email", subject: "Sent proposal", outcome: "Replied" };
    expect(activityHeadline(email)).toBe("Email · Sent proposal · Replied");
    expect(titleFor(email)).toBe(activityHeadline(email)); // tabs agree

    const quote = { type: "QuoteSent", subject: "Q-1001", outcome: "" };
    expect(activityHeadline(quote)).toBe("QuoteSent · Q-1001");
    expect(titleFor(quote)).toBe(activityHeadline(quote));
  });
});

describe("buildUnifiedTimeline — item.at is the ENTERED time (occurredAt), not save-time", () => {
  // Contract-lock (GREEN — item.at is already occurredAt ?? createdAt): the
  // Timeline tab's absolute timestamp reads occurredAt when present, so the
  // displayed time is the agent's entered Activity DateTime, never createdAt.
  // Guards against a silent flip to createdAt. The relative->absolute RENDER swap
  // ({rel} -> formatDateTime(item.at)) is browser-verified.
  it("item.at === occurredAt when occurredAt is present (distinct from createdAt)", () => {
    const items = buildUnifiedTimeline({
      ...EMPTY,
      activities: [
        {
          id: "a1", type: "Call", subject: "Call Disposition - Could Not Connect", outcome: "",
          ownerName: "Admin User",
          occurredAt: "2026-06-19T00:19:00.000Z", // entered time
          createdAt: "2026-06-19T00:20:29.000Z", // save time (~90s later)
          activityCode: null, detailNotes: null,
        },
      ],
    });
    expect(items[0].at).toBe(new Date("2026-06-19T00:19:00.000Z").toISOString());
    expect(items[0].at).not.toBe(new Date("2026-06-19T00:20:29.000Z").toISOString());
  });

  it("falls back to createdAt only when occurredAt is null", () => {
    const items = buildUnifiedTimeline({
      ...EMPTY,
      activities: [
        {
          id: "a2", type: "Call", subject: "x", outcome: "",
          ownerName: "Admin User", occurredAt: null,
          createdAt: "2026-06-19T00:20:29.000Z",
          activityCode: null, detailNotes: null,
        },
      ],
    });
    expect(items[0].at).toBe(new Date("2026-06-19T00:20:29.000Z").toISOString());
  });
});
