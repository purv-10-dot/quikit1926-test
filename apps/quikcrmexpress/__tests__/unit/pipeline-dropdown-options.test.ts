import { describe, expect, it } from "vitest";
import {
  isStageListRestrictedBySource,
  visibleStagesForSource,
  visibleStatusesForStage,
} from "@/lib/leads/pipeline-dropdown-options";

describe("pipeline dropdown options", () => {
  const allStages = ["New", "Contacted", "Qualified"];
  const rules = {
    sourceToStages: { LinkedIn: ["New"] },
    stageToStatuses: { New: ["new"] },
  };

  it("filters stages when source has a restriction rule", () => {
    expect(visibleStagesForSource(allStages, rules, "LinkedIn")).toEqual(["New"]);
    expect(isStageListRestrictedBySource(allStages, rules, "LinkedIn")).toBe(true);
  });

  it("shows all stages when source has no rule", () => {
    expect(visibleStagesForSource(allStages, rules, "Web")).toEqual(allStages);
    expect(isStageListRestrictedBySource(allStages, rules, "Web")).toBe(false);
  });

  it("matches source rules case-insensitively", () => {
    expect(visibleStagesForSource(allStages, rules, "linkedin")).toEqual(["New"]);
  });

  it("filters statuses when stage has a restriction rule", () => {
    expect(visibleStatusesForStage(["Open", "new", "Working"], rules, "New")).toEqual(["new"]);
  });
});
