import { describe, expect, it, vi } from "vitest";

const dbMock = {
  crmQuoteEngagementEvent: {
    create: vi.fn(),
  },
  crmQuote: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  crmActivity: {
    create: vi.fn(),
  },
} as any;

vi.mock("@/lib/db", () => ({ db: dbMock }));

describe("recordQuoteEngagement", () => {
  it("writes CrmActivity.detailNotes (not body) for IP capture", async () => {
    const { recordQuoteEngagement } = await import(
      "@/lib/services/quotes/enterprise/engagement-service"
    );

    dbMock.crmQuoteEngagementEvent.create.mockResolvedValueOnce(undefined);
    dbMock.crmQuote.findFirst.mockResolvedValueOnce({ engagementStatus: null, firstViewedAt: null });
    dbMock.crmQuote.update.mockResolvedValueOnce(undefined);
    dbMock.crmActivity.create.mockResolvedValueOnce(undefined);

    await recordQuoteEngagement({
      tenantId: "t1",
      quoteId: "q1",
      eventType: "quote_viewed",
      ipAddress: "::1",
    });

    expect(dbMock.crmActivity.create).toHaveBeenCalledTimes(1);
    const callArg = dbMock.crmActivity.create.mock.calls[0]![0];
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

