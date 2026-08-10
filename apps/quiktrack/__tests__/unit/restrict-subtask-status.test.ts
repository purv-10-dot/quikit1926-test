import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_subtask_status;

function ctx(subtaskStatuses: string[]): RuleContext {
  return {
    userId: "u1",
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: "s1", assigneeId: null, resolutionId: null, priority: null,
    },
    toStatusId: "s2",
    toStatusCategory: "DONE",
    inputs: {},
    prim: {
      userInProjectRole: async () => false,
      userCanInProject: async () => false,
      subtaskStatusIds: async () => subtaskStatuses,
      transitionHistory: async () => [],
      parentStatusId: async () => null,
      projectLeadId: async () => null,
      parentFieldValue: async () => null,
    },
  };
}

describe("restrict_subtask_status condition", () => {
  it("requires at least one status in config", () => {
    expect(handler.validateConfig?.({})).toEqual(["Pick at least one subtask status"]);
    expect(handler.validateConfig?.({ statusIds: ["done"] })).toEqual([]);
  });

  it("no config selected → no restriction (passes)", async () => {
    expect(await handler.evaluate(ctx(["open"]), {})).toBe(true);
  });

  it("no subtasks → passes", async () => {
    expect(await handler.evaluate(ctx([]), { statusIds: ["done"] })).toBe(true);
  });

  it("passes only when EVERY subtask is in an allowed status", async () => {
    const config = { statusIds: ["done", "closed"] };
    expect(await handler.evaluate(ctx(["done", "closed", "done"]), config)).toBe(true);
    expect(await handler.evaluate(ctx(["done", "open"]), config)).toBe(false);
  });
});
