import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext, RuleIssueSnapshot } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_field_value;

function ctx(issue: Partial<RuleIssueSnapshot>): RuleContext {
  return {
    userId: "u1",
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: "s1", assigneeId: null, resolutionId: null, priority: "MEDIUM",
      ...issue,
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

describe("restrict_field_value condition", () => {
  it("validateConfig requires field + op + value", () => {
    expect(handler.validateConfig?.({})).toEqual([
      "Choose a field",
      "Choose whether it equals or doesn't equal",
      "Enter a value to compare against",
    ]);
    expect(handler.validateConfig?.({ field: "priority", op: "eq", value: "HIGH" })).toEqual([]);
  });

  it("unknown field fails safe (hidden)", async () => {
    expect(await handler.evaluate(ctx({}), { field: "components", op: "eq", value: "x" })).toBe(false);
  });

  it("text equals / doesn't equal", async () => {
    const cfg = { field: "priority", valueType: "text", op: "eq", value: "HIGH" };
    expect(await handler.evaluate(ctx({ priority: "HIGH" }), cfg)).toBe(true);
    expect(await handler.evaluate(ctx({ priority: "LOW" }), cfg)).toBe(false);
    const neq = { ...cfg, op: "neq" };
    expect(await handler.evaluate(ctx({ priority: "LOW" }), neq)).toBe(true);
    expect(await handler.evaluate(ctx({ priority: "HIGH" }), neq)).toBe(false);
  });

  it("null field compares as empty string for text", async () => {
    const cfg = { field: "assignee", valueType: "text", op: "eq", value: "" };
    // empty value is rejected by validateConfig, but evaluate still treats null as ""
    expect(await handler.evaluate(ctx({ assigneeId: null }), cfg)).toBe(true);
    expect(await handler.evaluate(ctx({ assigneeId: "u9" }), { ...cfg, value: "u9" })).toBe(true);
  });

  it("number comparison: unset/non-numeric never equals", async () => {
    // storyPoints isn't in the snapshot; use priority-as-number path via a numeric field value.
    const cfg = { field: "priority", valueType: "number", op: "eq", value: "3" };
    // priority "MEDIUM" → NaN → not equal to 3
    expect(await handler.evaluate(ctx({ priority: "MEDIUM" }), cfg)).toBe(false);
    // a numeric-looking priority string equals when the numbers match
    expect(await handler.evaluate(ctx({ priority: "3" }), cfg)).toBe(true);
  });
});
