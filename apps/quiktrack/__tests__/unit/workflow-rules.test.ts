import { describe, it, expect } from "vitest";
import {
  evaluateConditions,
  runValidators,
  runPostFunctions,
  validateRuleConfig,
} from "@/lib/services/workflow/rules/engine";
import type {
  RuleContext,
  RuleSpec,
} from "@/lib/services/workflow/rules/context";

function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    userId: "u1",
    issue: {
      id: "i1",
      orgId: "o1",
      projectId: "p1",
      type: "Task",
      statusId: "s1",
      assigneeId: null,
      resolutionId: null,
      priority: "MEDIUM",
    },
    toStatusId: "s2",
    toStatusCategory: "DONE",
    inputs: {},
    prim: {
      userCanInProject: async () => false,
      userInProjectRole: async () => false,
    },
    ...over,
  };
}

const rule = (o: Partial<RuleSpec> & { id: string; type: string }): RuleSpec => ({
  config: {},
  errorMessage: null,
  groupNo: 0,
  orderNo: 0,
  ...o,
});

describe("evaluateConditions — grouping", () => {
  it("empty list is always available", async () => {
    expect(await evaluateConditions(ctx(), [])).toBe(true);
  });

  it("A AND (B OR C): group0=[A], group1=[B,C]", async () => {
    // A = is_assignee (make user the assignee); B,C both false.
    const c = ctx({ issue: { ...ctx().issue, assigneeId: "u1" } });
    const conds = [
      rule({ id: "a", type: "is_assignee", groupNo: 0 }),
      rule({ id: "b", type: "has_permission", config: { resource: "Issue", action: "update" }, groupNo: 1 }),
      rule({ id: "cc", type: "is_assignee", groupNo: 1 }), // true (assignee) → group1 OR passes
    ];
    expect(await evaluateConditions(c, conds)).toBe(true);
  });

  it("fails when an AND-group has no passing member", async () => {
    const conds = [
      rule({ id: "a", type: "is_assignee", groupNo: 0 }), // assignee null → false
    ];
    expect(await evaluateConditions(ctx(), conds)).toBe(false);
  });

  it("unknown condition type fails safe (false)", async () => {
    const conds = [rule({ id: "x", type: "does_not_exist", groupNo: 0 })];
    expect(await evaluateConditions(ctx(), conds)).toBe(false);
  });

  it("has_permission passes when the primitive grants it", async () => {
    const c = ctx({
      prim: { userCanInProject: async () => true, userInProjectRole: async () => false },
    });
    const conds = [rule({ id: "p", type: "has_permission", config: { resource: "Issue", action: "update" } })];
    expect(await evaluateConditions(c, conds)).toBe(true);
  });
});

describe("runValidators — aggregation", () => {
  it("aggregates all failures", async () => {
    const vals = [
      rule({ id: "v1", type: "field_required", config: { fieldId: "resolutionId" }, orderNo: 0 }),
      rule({ id: "v2", type: "permission_required", config: { resource: "Issue", action: "update" }, orderNo: 1 }),
    ];
    const failures = await runValidators(ctx(), vals);
    expect(failures).toHaveLength(2);
  });

  it("field_required passes when the input supplies the value", async () => {
    const c = ctx({ inputs: { resolutionId: "res_done" } });
    const vals = [rule({ id: "v1", type: "field_required", config: { fieldId: "resolutionId" } })];
    expect(await runValidators(c, vals)).toHaveLength(0);
  });

  it("field_required reads the stored issue value when no input", async () => {
    const c = ctx({ issue: { ...ctx().issue, resolutionId: "res_done" } });
    const vals = [rule({ id: "v1", type: "field_required", config: { fieldId: "resolutionId" } })];
    expect(await runValidators(c, vals)).toHaveLength(0);
  });
});

describe("runPostFunctions — ordering + patch merge", () => {
  it("set_resolution sets resolutionId", async () => {
    const { patch } = await runPostFunctions(ctx(), [
      rule({ id: "p1", type: "set_resolution", config: { resolutionId: "res_done" } }),
    ]);
    expect(patch?.resolutionId).toBe("res_done");
  });

  it("clear_resolution nulls resolutionId", async () => {
    const { patch } = await runPostFunctions(
      ctx({ issue: { ...ctx().issue, resolutionId: "res_done" } }),
      [rule({ id: "p1", type: "clear_resolution" })],
    );
    expect(patch?.resolutionId).toBeNull();
  });

  it("assign to actor sets the acting user", async () => {
    const { patch } = await runPostFunctions(ctx(), [
      rule({ id: "p1", type: "assign", config: { to: "actor" } }),
    ]);
    expect(patch?.assigneeId).toBe("u1");
  });

  it("later post-function wins on the same field", async () => {
    const { patch } = await runPostFunctions(ctx(), [
      rule({ id: "p1", type: "set_resolution", config: { resolutionId: "first" }, orderNo: 0 }),
      rule({ id: "p2", type: "set_resolution", config: { resolutionId: "second" }, orderNo: 1 }),
    ]);
    expect(patch?.resolutionId).toBe("second");
  });
});

describe("field_regex validator", () => {
  it("passes when the value matches the pattern", async () => {
    const c = ctx({ inputs: { title: "BUG-123" } });
    const vals = [rule({ id: "v", type: "field_regex", config: { fieldId: "title", pattern: "^BUG-\\d+$" } })];
    expect(await runValidators(c, vals)).toHaveLength(0);
  });
  it("fails when the value does not match", async () => {
    const c = ctx({ inputs: { title: "nope" } });
    const vals = [rule({ id: "v", type: "field_regex", config: { fieldId: "title", pattern: "^BUG-\\d+$" } })];
    expect(await runValidators(c, vals)).toHaveLength(1);
  });
  it("empty value passes (that's a required concern, not a format one)", async () => {
    const c = ctx({ inputs: { title: "" } });
    const vals = [rule({ id: "v", type: "field_regex", config: { fieldId: "title", pattern: "^BUG-\\d+$" } })];
    expect(await runValidators(c, vals)).toHaveLength(0);
  });
  it("rejects an invalid pattern at config time", () => {
    expect(validateRuleConfig("VALIDATOR", "field_regex", { fieldId: "t", pattern: "([" })).toContain(
      "pattern is not a valid regular expression",
    );
  });
});

describe("add_comment post-function", () => {
  it("returns a comment body with {actor}/{status} substituted", async () => {
    const effects = await runPostFunctions(ctx(), [
      rule({ id: "p", type: "add_comment", config: { text: "Moved to {status} by {actor}" } }),
    ]);
    expect(effects.comments).toEqual(["Moved to s2 by u1"]);
  });
  it("no comment when text is blank", async () => {
    const effects = await runPostFunctions(ctx(), [
      rule({ id: "p", type: "add_comment", config: { text: "" } }),
    ]);
    expect(effects.comments).toHaveLength(0);
  });
});

describe("validateRuleConfig", () => {
  it("flags missing config", () => {
    expect(validateRuleConfig("VALIDATOR", "field_required", {})).toContain(
      "fieldId is required for field_required",
    );
  });
  it("rejects unknown type", () => {
    expect(validateRuleConfig("CONDITION", "nope", {})[0]).toMatch(/Unknown/);
  });
  it("passes valid config", () => {
    expect(
      validateRuleConfig("POSTFUNCTION", "set_resolution", { resolutionId: "x" }),
    ).toHaveLength(0);
  });
});
