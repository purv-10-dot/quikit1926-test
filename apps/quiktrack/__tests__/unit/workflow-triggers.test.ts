import { describe, it, expect } from "vitest";
import { TRIGGER_CATALOG, isTriggerEvent, triggerLabel } from "@/lib/services/workflow/triggers";

describe("workflow trigger catalog", () => {
  it("lists exactly the 6 GitHub dev events (no Crucible)", () => {
    expect(TRIGGER_CATALOG.map((t) => t.event)).toEqual([
      "pr_created", "pr_merged", "pr_declined", "pr_reopened", "branch_created", "commit_created",
    ]);
  });

  it("isTriggerEvent validates known events", () => {
    expect(isTriggerEvent("pr_merged")).toBe(true);
    expect(isTriggerEvent("review_started")).toBe(false); // Crucible — not supported
    expect(isTriggerEvent("")).toBe(false);
  });

  it("triggerLabel returns the human label", () => {
    expect(triggerLabel("branch_created")).toBe("Branch created");
    expect(triggerLabel("nope")).toBe("nope");
  });
});
