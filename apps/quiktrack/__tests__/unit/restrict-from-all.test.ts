import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_from_all;

function ctx(isApiActor?: boolean): RuleContext {
  return {
    userId: "u1",
    isApiActor,
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
      subtaskStatusIds: async () => [],
      transitionHistory: async () => [],
    },
  };
}

describe("restrict_from_all condition", () => {
  it("validateConfig requires a valid mode", () => {
    expect(handler.validateConfig?.({})).toEqual([
      "Choose whether to restrict from all users but allow APIs, or including APIs",
    ]);
    expect(handler.validateConfig?.({ mode: "allow_apis" })).toEqual([]);
    expect(handler.validateConfig?.({ mode: "including_apis" })).toEqual([]);
  });

  it("blocks every human caller in both modes", async () => {
    expect(await handler.evaluate(ctx(false), { mode: "allow_apis" })).toBe(false);
    expect(await handler.evaluate(ctx(false), { mode: "including_apis" })).toBe(false);
  });

  it("allow_apis exempts an API/automation actor", async () => {
    expect(await handler.evaluate(ctx(true), { mode: "allow_apis" })).toBe(true);
  });

  it("including_apis blocks even API actors", async () => {
    expect(await handler.evaluate(ctx(true), { mode: "including_apis" })).toBe(false);
  });

  it("defaults to including_apis (blocks) when mode is absent", async () => {
    expect(await handler.evaluate(ctx(true), {})).toBe(false);
  });
});
