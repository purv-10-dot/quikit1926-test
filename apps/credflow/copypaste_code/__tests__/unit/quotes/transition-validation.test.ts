import { describe, expect, it } from "vitest";
import {
  TransitionError,
  validateTransition,
} from "@/lib/services/quotes/transition-service";

describe("validateTransition", () => {
  it("allows Draft → Active", () => {
    expect(() => validateTransition("Draft", { toStatus: "Active" })).not.toThrow();
  });

  it("allows Active → Won (no reason required)", () => {
    expect(() => validateTransition("Active", { toStatus: "Won" })).not.toThrow();
  });

  it("requires a reason when marking Lost", () => {
    expect(() => validateTransition("Active", { toStatus: "Lost" })).toThrow(TransitionError);
    expect(() => validateTransition("Active", { toStatus: "Lost", reason: "" })).toThrow();
    expect(() =>
      validateTransition("Active", { toStatus: "Lost", reason: "Price" }),
    ).not.toThrow();
  });

  it("rejects whitespace-only Lost reasons", () => {
    // Tabs, spaces, newlines — all garbage for forecast cohorts.
    expect(() =>
      validateTransition("Active", { toStatus: "Lost", reason: "   " }),
    ).toThrow(TransitionError);
    expect(() =>
      validateTransition("Active", { toStatus: "Lost", reason: "\t\n" }),
    ).toThrow(TransitionError);
  });

  it("rejects same-status transitions with 409", () => {
    try {
      validateTransition("Draft", { toStatus: "Draft" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError);
      expect((e as TransitionError).statusCode).toBe(409);
    }
  });

  it("blocks departing terminal states (Won, Lost, Revised)", () => {
    expect(() => validateTransition("Won", { toStatus: "Active" })).toThrow();
    expect(() => validateTransition("Lost", { toStatus: "Active" })).toThrow();
    expect(() => validateTransition("Revised", { toStatus: "Draft" })).toThrow();
  });

  it("blocks Draft → Won (must go through Active first)", () => {
    expect(() => validateTransition("Draft", { toStatus: "Won" })).toThrow();
  });

  it("blocks Draft → Lost", () => {
    expect(() => validateTransition("Draft", { toStatus: "Lost", reason: "x" })).toThrow();
  });

  it("blocks Active → Draft (no going back)", () => {
    expect(() => validateTransition("Active", { toStatus: "Draft" })).toThrow();
  });
});
