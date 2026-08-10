import { describe, expect, it } from "vitest";
import {
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_DEFAULT_PROBABILITY,
  TERMINAL_STAGES,
} from "@/lib/services/opportunities/stage-labels";

describe("stage-labels", () => {
  it("renames ClosedWon → Won and ClosedLost → Lost in the UI label map", () => {
    expect(STAGE_LABEL.ClosedWon).toBe("Won");
    expect(STAGE_LABEL.ClosedLost).toBe("Lost");
    expect(STAGE_LABEL.Prospecting).toBe("Prospecting");
    expect(STAGE_LABEL.Qualification).toBe("Qualification");
    expect(STAGE_LABEL.Proposal).toBe("Proposal");
    expect(STAGE_LABEL.Negotiation).toBe("Negotiation");
  });

  it("orders stages so Prospecting is first and ClosedLost is last", () => {
    expect(STAGE_ORDER[0]).toBe("Prospecting");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("ClosedLost");
    expect(STAGE_ORDER).toHaveLength(6);
  });

  it("treats only Closed* stages as terminal", () => {
    expect(TERMINAL_STAGES.has("ClosedWon")).toBe(true);
    expect(TERMINAL_STAGES.has("ClosedLost")).toBe(true);
    expect(TERMINAL_STAGES.has("Negotiation")).toBe(false);
    expect(TERMINAL_STAGES.has("Prospecting")).toBe(false);
  });

  it("defaults probability per stage matches the spec", () => {
    expect(STAGE_DEFAULT_PROBABILITY.Prospecting).toBe(10);
    expect(STAGE_DEFAULT_PROBABILITY.Qualification).toBe(25);
    expect(STAGE_DEFAULT_PROBABILITY.Proposal).toBe(50);
    expect(STAGE_DEFAULT_PROBABILITY.Negotiation).toBe(75);
    expect(STAGE_DEFAULT_PROBABILITY.ClosedWon).toBe(100);
    expect(STAGE_DEFAULT_PROBABILITY.ClosedLost).toBe(0);
  });
});
