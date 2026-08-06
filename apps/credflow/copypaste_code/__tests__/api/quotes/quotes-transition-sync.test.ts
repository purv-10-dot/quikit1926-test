/**
 * Cross-entity state-sync tests for the Quote transition service.
 *
 * Covers audit findings:
 *   W-1: Quote Won/Lost must update Opportunity probability (100 / 0)
 *        and timestamp Opportunity.lastActivityAt.
 *
 * Strategy: mock the Prisma transaction, drive the service directly so we
 * can assert on the exact updateMany calls + activity rows. The route is
 * tested separately; this file is about the service-layer contract.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { transitionQuote } from "@/lib/services/quotes/transition-service";

const db = mockDb();

describe("transitionQuote â€” Opportunity probability sync (audit W-1)", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.crmQuote.findFirst.mockReset();
    db.crmQuote.update.mockReset();
    db.crmOpportunity.updateMany.mockReset();
    db.crmQuoteStatusTransition.create.mockReset();
    db.crmActivity.create.mockReset();

    // The service uses $transaction(async tx => â€¦) â€” let the tx be our mock db.
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
  });

  it("Active â†’ Won: bumps the linked Opportunity to probability=100", async () => {
    // Quote exists, linked to an Opportunity.
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Active",
      opportunityId: "opp1",
    } as never);
    // updateMany returns count=1 â†’ the opportunity was open + got updated.
    db.crmOpportunity.updateMany.mockResolvedValue({ count: 1 } as never);
    // Final findFirst returns the updated quote shape (irrelevant detail).
    db.crmQuote.findFirst.mockResolvedValueOnce({ id: "q1", lines: [] } as never);

    await transitionQuote({
      tenantId: "t1",
      userId: "u1",
      userName: "Alice",
      quoteId: "q1",
      input: { toStatus: "Won" },
    });

    expect(db.crmOpportunity.updateMany).toHaveBeenCalledOnce();
    const call = db.crmOpportunity.updateMany.mock.calls[0]![0]! as {
      where: { id: string; tenantId: string; stage: { in: string[] } };
      data: { probability: number; lastActivityAt: Date };
    };
    expect(call.where.id).toBe("opp1");
    expect(call.where.tenantId).toBe("t1");
    // Only opens stages should be touched â€” don't overwrite Closed* manual decisions.
    expect(call.where.stage.in).toEqual(
      expect.arrayContaining(["Prospecting", "Qualification", "Proposal", "Negotiation"]),
    );
    expect(call.where.stage.in).not.toContain("ClosedWon");
    expect(call.where.stage.in).not.toContain("ClosedLost");
    expect(call.data.probability).toBe(100);
    expect(call.data.lastActivityAt).toBeInstanceOf(Date);
  });

  it("Active â†’ Lost: bumps the linked Opportunity to probability=0", async () => {
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Active",
      opportunityId: "opp1",
    } as never);
    db.crmOpportunity.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmQuote.findFirst.mockResolvedValueOnce({ id: "q1", lines: [] } as never);

    await transitionQuote({
      tenantId: "t1",
      userId: "u1",
      userName: "Alice",
      quoteId: "q1",
      input: { toStatus: "Lost", reason: "Price" },
    });

    const call = db.crmOpportunity.updateMany.mock.calls[0]![0]! as {
      data: { probability: number };
    };
    expect(call.data.probability).toBe(0);
  });

  it("skips Opportunity sync when the quote has no opportunityId", async () => {
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Active",
      opportunityId: null,
    } as never);
    db.crmQuote.findFirst.mockResolvedValueOnce({ id: "q1", lines: [] } as never);

    await transitionQuote({
      tenantId: "t1",
      userId: "u1",
      userName: "Alice",
      quoteId: "q1",
      input: { toStatus: "Won" },
    });

    expect(db.crmOpportunity.updateMany).not.toHaveBeenCalled();
  });

  it("doesn't fire the sync on non-terminal transitions (Draft â†’ Active)", async () => {
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Draft",
      opportunityId: "opp1",
    } as never);
    db.crmQuote.findFirst.mockResolvedValueOnce({ id: "q1", lines: [] } as never);

    await transitionQuote({
      tenantId: "t1",
      userId: "u1",
      userName: "Alice",
      quoteId: "q1",
      input: { toStatus: "Active" },
    });

    // Activation doesn't touch the opportunity â€” that's reserved for the
    // terminal won/lost transitions only.
    expect(db.crmOpportunity.updateMany).not.toHaveBeenCalled();
  });

  it("doesn't emit the OpportunityProbabilityFromQuote activity when the opp was already closed (updateMany count=0)", async () => {
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Active",
      opportunityId: "opp-closed",
    } as never);
    // Opp already ClosedWon/Lost â†’ updateMany matches 0 rows.
    db.crmOpportunity.updateMany.mockResolvedValue({ count: 0 } as never);
    db.crmQuote.findFirst.mockResolvedValueOnce({ id: "q1", lines: [] } as never);

    await transitionQuote({
      tenantId: "t1",
      userId: "u1",
      userName: "Alice",
      quoteId: "q1",
      input: { toStatus: "Won" },
    });

    // The quote's own transition activity still fires; only the
    // *probability-from-quote* activity is skipped.
    const probActivities = db.crmActivity.create.mock.calls.filter(
      (c) =>
        ((c[0] as { data?: { type?: string } })?.data?.type ?? "") ===
        "OpportunityProbabilityFromQuote",
    );
    expect(probActivities).toHaveLength(0);
  });
});
