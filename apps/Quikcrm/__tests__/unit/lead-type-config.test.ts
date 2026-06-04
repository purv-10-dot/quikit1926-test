import { describe, expect, it } from "vitest";
import { validateRequirementDetails } from "@/lib/leads/lead-type-config";

describe("validateRequirementDetails", () => {
  it("requires technology for Fixed Project", () => {
    const errs = validateRequirementDetails("Fixed Project", {
      projectTitle: "X",
      projectDescription: "Y",
    });
    expect(errs["req.technology"]).toBeDefined();
  });

  it("passes when required dedicated-resource fields are set", () => {
    const errs = validateRequirementDetails("Dedicated Resource Sharing", {
      technology: ["SAP"],
      profile: "Senior dev",
      jdClientJd: "Need 5 engineers",
    });
    expect(Object.keys(errs)).toHaveLength(0);
  });
});
