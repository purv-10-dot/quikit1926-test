import { describe, it, expect } from "vitest";
import {
  assertTransition,
  canTransition,
  TransitionError,
  TRANSITION_MAPS,
  ISSUE_TRANSITIONS,
  GRN_TRANSITIONS,
  DPR_TRANSITIONS,
  RAB_TRANSITIONS,
} from "@/lib/workflow/transitions";

describe("canTransition", () => {
  it("returns true for an allowed move", () => {
    expect(canTransition("dpr", "draft", "submitted")).toBe(true);
    expect(canTransition("rab", "approved", "paid")).toBe(true);
    expect(canTransition("issue", "submitted", "approved")).toBe(true);
  });

  it("returns false for an illegal move", () => {
    expect(canTransition("dpr", "draft", "approved")).toBe(false);
    expect(canTransition("rab", "paid", "draft")).toBe(false);
  });

  it("returns false from a terminal state", () => {
    expect(canTransition("issue", "cancelled", "draft")).toBe(false);
    expect(canTransition("issue", "reversed", "draft")).toBe(false);
  });

  it("returns false for an unknown entity", () => {
    expect(canTransition("nope" as any, "draft", "submitted")).toBe(false);
  });

  it("returns false for an unknown source state", () => {
    expect(canTransition("dpr", "bogus", "submitted")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("does not throw for an allowed move", () => {
    expect(() => assertTransition("po", "draft", "pending_l1")).not.toThrow();
    expect(() => assertTransition("grn", "draft", "pending_approval")).not.toThrow();
  });

  it("throws TransitionError on an illegal move", () => {
    expect(() => assertTransition("dpr", "draft", "approved")).toThrow(TransitionError);
  });

  it("throws on an unknown entity", () => {
    expect(() => assertTransition("nope" as any, "a", "b")).toThrow(TransitionError);
  });

  it("throws from a terminal state", () => {
    expect(() => assertTransition("rab", "paid", "approved")).toThrow(TransitionError);
  });

  it("carries entity/from/to + code + httpStatus on the error", () => {
    try {
      assertTransition("dpr", "draft", "approved");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError);
      const te = e as TransitionError;
      expect(te.entity).toBe("dpr");
      expect(te.from).toBe("draft");
      expect(te.to).toBe("approved");
      expect(te.code).toBe("INVALID_TRANSITION");
      expect(te.httpStatus).toBe(400);
      expect(te.name).toBe("TransitionError");
    }
  });

  it("lists the allowed targets in the message", () => {
    const te = new TransitionError("dpr", "draft", "approved");
    expect(te.message).toContain("submitted");
    expect(te.message).toContain("cancelled");
  });

  it("reports (terminal state) when there are no allowed targets", () => {
    const te = new TransitionError("rab", "paid", "draft");
    expect(te.message).toContain("(terminal state)");
  });
});

describe("TRANSITION_MAPS wiring", () => {
  it("exposes every entity map", () => {
    expect(Object.keys(TRANSITION_MAPS).sort()).toEqual(
      ["dpr", "grn", "indent", "issue", "mr", "po", "rab"].sort(),
    );
  });

  it("re-exports the local maps", () => {
    expect(TRANSITION_MAPS.issue).toBe(ISSUE_TRANSITIONS);
    expect(TRANSITION_MAPS.grn).toBe(GRN_TRANSITIONS);
    expect(TRANSITION_MAPS.dpr).toBe(DPR_TRANSITIONS);
    expect(TRANSITION_MAPS.rab).toBe(RAB_TRANSITIONS);
  });

  it("returned/rejected recovery paths exist for DPR + RAB", () => {
    expect(canTransition("dpr", "returned", "draft")).toBe(true);
    expect(canTransition("dpr", "rejected", "draft")).toBe(true);
    expect(canTransition("rab", "returned", "submitted")).toBe(true);
  });
});
