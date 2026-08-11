import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_PIPELINE_STEPS,
  resolveStepIndex,
  resolveTenantStageForStep,
} from "@/lib/services/leads/pipeline-stepper";

describe("pipeline-stepper", () => {
  it("resolves known tenant stage to enterprise step", () => {
    expect(resolveStepIndex("Qualified")).toBe(
      ENTERPRISE_PIPELINE_STEPS.findIndex((s) => s.id === "qualified"),
    );
  });

  it("maps enterprise step to tenant stage when alias exists", () => {
    const step = ENTERPRISE_PIPELINE_STEPS.find((s) => s.id === "proposal")!;
    expect(resolveTenantStageForStep(step, ["New", "Proposal", "Closed"])).toBe("Proposal");
  });
});
