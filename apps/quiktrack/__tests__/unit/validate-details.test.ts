import { describe, it, expect } from "vitest";
import { VALIDATOR_REGISTRY } from "@/lib/services/workflow/rules/validators";
import type { RuleContext, RuleIssueSnapshot, TransitionHistoryEntry } from "@/lib/services/workflow/rules/context";

function ctx(over: {
  issue?: Partial<RuleIssueSnapshot>;
  inputs?: Record<string, unknown>;
  history?: TransitionHistoryEntry[];
  parentStatusId?: string | null;
  can?: boolean;
}): RuleContext {
  return {
    userId: "u1",
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: "s_current", assigneeId: null, resolutionId: null, priority: "MEDIUM",
      ...over.issue,
    },
    toStatusId: "s2",
    toStatusCategory: "DONE",
    inputs: over.inputs ?? {},
    prim: {
      userInProjectRole: async () => false,
      userCanInProject: async () => over.can ?? false,
      subtaskStatusIds: async () => [],
      transitionHistory: async () => over.history ?? [],
      parentStatusId: async () => over.parentStatusId ?? null,
      projectLeadId: async () => null,
      parentFieldValue: async () => null,
    },
  };
}

describe("validate_field", () => {
  const h = VALIDATOR_REGISTRY.validate_field;
  it("not_empty / single_value: fails when empty", async () => {
    expect(await h.validate(ctx({ issue: { priority: null } }), { field: "priority", check: "not_empty" })).toBeTruthy();
    expect(await h.validate(ctx({ issue: { priority: "HIGH" } }), { field: "priority", check: "single_value" })).toBeNull();
  });
  it("regex: must match the pattern", async () => {
    const cfg = { field: "title", check: "regex", pattern: "^[A-Z]+$" };
    expect(await h.validate(ctx({ issue: { title: "ABC" } }), cfg)).toBeNull();
    expect(await h.validate(ctx({ issue: { title: "abc" } }), cfg)).toBeTruthy();
  });
  it("modified: passes only when the field is changed by this move", async () => {
    const cfg = { field: "assignee", check: "modified" };
    expect(await h.validate(ctx({ issue: { assigneeId: "a" }, inputs: { assigneeId: "b" } }), cfg)).toBeNull();
    expect(await h.validate(ctx({ issue: { assigneeId: "a" }, inputs: { assigneeId: "a" } }), cfg)).toBeTruthy();
    expect(await h.validate(ctx({ issue: { assigneeId: "a" } }), cfg)).toBeTruthy();
  });
  it("compares_date: field must be on or before another date field", async () => {
    const cfg = { field: "startDate", check: "compares_date", otherField: "dueDate" };
    expect(await h.validate(ctx({ issue: { startDate: "2026-06-01", dueDate: "2026-06-10" } }), cfg)).toBeNull();
    expect(await h.validate(ctx({ issue: { startDate: "2026-06-20", dueDate: "2026-06-10" } }), cfg)).toBeTruthy();
  });
  it("validateConfig requires field + check (+ pattern for regex)", () => {
    expect(h.validateConfig?.({})).toEqual(["Choose a field", "Choose what to validate"]);
    expect(h.validateConfig?.({ field: "title", check: "regex" })).toEqual(["Enter a regular expression"]);
    expect(h.validateConfig?.({ field: "title", check: "not_empty" })).toEqual([]);
  });
});

describe("validate_been_through", () => {
  const h = VALIDATOR_REGISTRY.validate_been_through;
  const move = (to: string): TransitionHistoryEntry => ({ fromStatusId: null, toStatusId: to, actorId: null });
  it("fails when the item never had the required status", async () => {
    const cfg = { statusIds: ["in_progress"] };
    expect(await h.validate(ctx({ history: [move("open"), move("in_progress"), move("s_current")] }), cfg)).toBeNull();
    expect(await h.validate(ctx({ history: [move("open"), move("s_current")] }), cfg)).toBeTruthy();
  });
});

describe("validate_parent_status", () => {
  const h = VALIDATOR_REGISTRY.validate_parent_status;
  it("passes when no parent; enforces parent status otherwise", async () => {
    const cfg = { statusIds: ["done"] };
    expect(await h.validate(ctx({ parentStatusId: null }), cfg)).toBeNull();
    expect(await h.validate(ctx({ parentStatusId: "done" }), cfg)).toBeNull();
    expect(await h.validate(ctx({ parentStatusId: "open" }), cfg)).toBeTruthy();
  });
});

describe("validate_permission", () => {
  const h = VALIDATOR_REGISTRY.validate_permission;
  it("passes only when the user holds the permission", async () => {
    const cfg = { resource: "Issue", action: "update" };
    expect(await h.validate(ctx({ can: true }), cfg)).toBeNull();
    expect(await h.validate(ctx({ can: false }), cfg)).toBeTruthy();
  });
  it("validateConfig requires a permission", () => {
    expect(h.validateConfig?.({})).toEqual(["Choose a permission", "Choose a permission"]);
    expect(h.validateConfig?.({ resource: "Issue", action: "update" })).toEqual([]);
  });
});
