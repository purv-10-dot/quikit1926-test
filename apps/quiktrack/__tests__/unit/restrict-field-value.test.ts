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
      parentStatusId: async () => null,
    },
  };
}

describe("restrict_field_value condition", () => {
  it("validateConfig requires field + op + value", () => {
    expect(handler.validateConfig?.({})).toEqual(["Choose a field"]);
    expect(handler.validateConfig?.({ field: "priority" })).toEqual([
      "Choose a comparison",
      "Enter a value to compare against",
    ]);
    expect(handler.validateConfig?.({ field: "priority", op: "eq", value: "HIGH" })).toEqual([]);
  });

  it("unknown field fails safe (hidden)", async () => {
    expect(await handler.evaluate(ctx({}), { field: "components", op: "eq", value: "x" })).toBe(false);
  });

  it("text field: equals / doesn't equal", async () => {
    const cfg = { field: "priority", op: "eq", value: "HIGH" };
    expect(await handler.evaluate(ctx({ priority: "HIGH" }), cfg)).toBe(true);
    expect(await handler.evaluate(ctx({ priority: "LOW" }), cfg)).toBe(false);
    expect(await handler.evaluate(ctx({ priority: "LOW" }), { ...cfg, op: "neq" })).toBe(true);
  });

  it("text field: title/description/reporter compare as strings", async () => {
    expect(await handler.evaluate(ctx({ title: "Bug" }), { field: "title", op: "eq", value: "Bug" })).toBe(true);
    expect(await handler.evaluate(ctx({ reporterId: "u9" }), { field: "reporter", op: "eq", value: "u9" })).toBe(true);
    expect(await handler.evaluate(ctx({ reporterId: null }), { field: "reporter", op: "neq", value: "u9" })).toBe(true);
  });

  it("number field: numeric equals; unset/non-numeric never equals", async () => {
    const cfg = { field: "storyPoints", op: "eq", value: "3" };
    expect(await handler.evaluate(ctx({ storyPoints: 3 }), cfg)).toBe(true);
    expect(await handler.evaluate(ctx({ storyPoints: 5 }), cfg)).toBe(false);
    expect(await handler.evaluate(ctx({ storyPoints: null }), cfg)).toBe(false);
    expect(await handler.evaluate(ctx({ storyPoints: null }), { ...cfg, op: "neq" })).toBe(true);
    // text op on a number field is rejected (fail safe)
    expect(await handler.evaluate(ctx({ storyPoints: 3 }), { field: "storyPoints", op: "after", value: "1" })).toBe(false);
  });

  it("date field: before / after / equals against an ISO date", async () => {
    const due = "2026-06-15T00:00:00.000Z";
    const before = { field: "dueDate", op: "before", value: "2026-07-01" };
    const after = { field: "dueDate", op: "after", value: "2026-06-01" };
    expect(await handler.evaluate(ctx({ dueDate: due }), before)).toBe(true);
    expect(await handler.evaluate(ctx({ dueDate: due }), after)).toBe(true);
    expect(await handler.evaluate(ctx({ dueDate: due }), { field: "dueDate", op: "after", value: "2026-07-01" })).toBe(false);
    // unset date is "not equal" to any date, never before/after
    expect(await handler.evaluate(ctx({ dueDate: null }), before)).toBe(false);
    expect(await handler.evaluate(ctx({ dueDate: null }), { field: "dueDate", op: "neq", value: "2026-06-15" })).toBe(true);
  });

  it("date field: 'with time' compares the combined timestamp", async () => {
    // Use a local (no-Z) stored value so it parses in the same tz frame as the
    // config's date+time, keeping the assertion tz-independent.
    const due = "2026-06-15T13:00:00";
    expect(await handler.evaluate(ctx({ dueDate: due }), { field: "dueDate", op: "after", value: "2026-06-15", time: "10:00" })).toBe(true);
    expect(await handler.evaluate(ctx({ dueDate: due }), { field: "dueDate", op: "before", value: "2026-06-15", time: "10:00" })).toBe(false);
  });
});
