import { describe, expect, it, vi } from "vitest";

const dbMock = {
  qceQuoteEngagementEvent: {
    create: vi.fn(),
  },
  qceQuote: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  qceActivity: {
    create: vi.fn(),
  },
} as any;

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("recordQuoteEngagement", () => {
  it("writes CrmActivity.detailNotes (not body) for IP capture", async () => {
    const { recordQuoteEngagement } = await import(
      "@/lib/services/quotes/enterprise/engagement-service"
    );

    dbMock.qceQuoteEngagementEvent.create.mockResolvedValueOnce(undefined);
    dbMock.qceQuote.findFirst.mockResolvedValueOnce({ engagementStatus: null, firstViewedAt: null });
    dbMock.qceQuote.update.mockResolvedValueOnce(undefined);
    dbMock.qceActivity.create.mockResolvedValueOnce(undefined);

    await recordQuoteEngagement({
      orgId: "t1",
      quoteId: "q1",
      eventType: "quote_viewed",
      ipAddress: "::1",
    });

    expect(dbMock.qceActivity.create).toHaveBeenCalledTimes(1);
    const callArg = dbMock.qceActivity.create.mock.calls[0]![0];
    expect(callArg.data).toEqual(
      expect.objectContaining({
        type: "QuoteEngagement",
        relatedKind: "Quote",
        relatedObjectId: "q1",
        subject: "Quote viewed",
        detailNotes: "IP: ::1",
      }),
    );
    expect(callArg.data).not.toHaveProperty("body");
  });
});

