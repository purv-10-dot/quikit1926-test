import { describe, expect, it, vi, beforeEach } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const db = mockDb();

describe("resolvePriceListIdForQuote", () => {
  beforeEach(() => {
    vi.resetModules();
    db.crmOpportunity.findFirst.mockReset();
    db.crmAccount.findFirst.mockReset();
    db.crmPriceList.findFirst.mockReset();
  });

  it("prefers explicit price list id", async () => {
    const { resolvePriceListIdForQuote } = await import(
      "@/lib/services/quotes/resolve-price-list-for-record"
    );
    const id = await resolvePriceListIdForQuote({
      tenantId: "t1",
      accountId: "a1",
      explicitPriceListId: "pl-explicit",
    });
    expect(id).toBe("pl-explicit");
  });

  it("inherits from opportunity then account default", async () => {
    db.crmOpportunity.findFirst.mockResolvedValue({ priceListId: "pl-opp", accountId: "a1" } as never);
    const { resolvePriceListIdForQuote } = await import(
      "@/lib/services/quotes/resolve-price-list-for-record"
    );
    const id = await resolvePriceListIdForQuote({
      tenantId: "t1",
      accountId: "a1",
      opportunityId: "o1",
    });
    expect(id).toBe("pl-opp");
  });
});
