import { describe, expect, it } from "vitest";
import { validateTransition } from "@/lib/services/opportunities/transition-service";

/**
 * Under the full-relax default, the matrix permits every non-self move.
 * The only hard guards left are:
 *   1. Self-transition (no-op)
 *   2. closeReasonCategory required when target is closed
 *   3. closeReasonCategory must be one of the allowed values
 *
 * These tests pin down those guards plus a representative sample of
 * permissive moves to catch accidental re-tightening.
 */
describe("validateTransition — permissive moves", () => {
  it("allows fast-close from every open stage to ClosedWon when a reason is supplied", () => {
    for (const fromStage of ["Prospecting", "Qualification", "Proposal", "Negotiation"] as const) {
      expect(() =>
        validateTransition(
          fromStage,
          { toStage: "ClosedWon", closeReasonCategory: "Price" },
          false,
        ),
      ).not.toThrow();
    }
  });

  it("allows open-stage skips (Qualification → Negotiation, etc.)", () => {
    expect(() =>
      validateTransition("Qualification", { toStage: "Negotiation" }, false),
    ).not.toThrow();
  });

  it("allows reopening a closed deal back into the open pipeline", () => {
    expect(() =>
      validateTransition("ClosedWon", { toStage: "Negotiation" }, false),
    ).not.toThrow();
  });

  it("allows Won ↔ Lost when a reason is supplied", () => {
    expect(() =>
      validateTransition(
        "ClosedWon",
        { toStage: "ClosedLost", closeReasonCategory: "Competitor" },
        false,
      ),
    ).not.toThrow();
  });
});

describe("validateTransition — hard guards (still enforced)", () => {
  it("rejects self-transitions", () => {
    expect(() =>
      validateTransition("Proposal", { toStage: "Proposal" }, false),
    ).toThrow(/Already in/);
  });

  it("rejects closing a deal without a closeReasonCategory", () => {
    expect(() =>
      validateTransition("ClosedWon", { toStage: "ClosedLost" }, false),
    ).toThrow(/closeReasonCategory is required/);
  });

  it("rejects an out-of-set closeReasonCategory", () => {
    expect(() =>
      validateTransition(
        "Negotiation",
        { toStage: "ClosedLost", closeReasonCategory: "made-up-reason" },
        false,
      ),
    ).toThrow(/must be one of/);
  });
});
