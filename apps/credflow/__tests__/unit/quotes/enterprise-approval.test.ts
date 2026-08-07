import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    qcfQuote: {
      findFirst: vi.fn(),
    },
    qcfOrgWorkspaceSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { db } from "@/lib/db";
import { evaluateQuoteApproval } from "@/lib/services/quotes/enterprise/approval-service";

describe("evaluateQuoteApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires approval when line discount exceeds threshold", async () => {
    vi.mocked(db.qcfQuote.findFirst).mockResolvedValue({
      id: "q1",
      grandTotal: 100_000,
      overallDiscountAmount: 0,
      lines: [{ discountPct: 20 }],
    } as never);

    const result = await evaluateQuoteApproval("tenant-1", "q1");
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("20%"))).toBe(true);
  });

  it("does not require approval for small compliant quotes", async () => {
    vi.mocked(db.qcfQuote.findFirst).mockResolvedValue({
      id: "q1",
      grandTotal: 50_000,
      overallDiscountAmount: 0,
      lines: [{ discountPct: 5 }],
    } as never);

    const result = await evaluateQuoteApproval("tenant-1", "q1");
    expect(result.required).toBe(false);
  });
});
