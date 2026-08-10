import { describe, it, expect } from "vitest";
import { POSTFUNCTION_REGISTRY } from "@/lib/services/workflow/rules/post-functions";
import type { RuleContext, RuleIssueSnapshot } from "@/lib/services/workflow/rules/context";

function ctx(over: {
  issue?: Partial<RuleIssueSnapshot>;
  userId?: string;
  lead?: string | null;
  parentField?: string | null;
}): RuleContext {
  return {
    userId: over.userId ?? "actor_1",
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: "s1", assigneeId: null, resolutionId: null, priority: "MEDIUM",
      reporterId: "rep_1", ...over.issue,
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
      projectLeadId: async () => over.lead ?? null,
      parentFieldValue: async () => over.parentField ?? null,
    },
  };
}

describe("assign action", () => {
  const h = POSTFUNCTION_REGISTRY.assign;
  it("resolves tokens to an assignee", async () => {
    expect((await h.run(ctx({ userId: "u9" }), { to: "actor" })).patch?.assigneeId).toBe("u9");
    expect((await h.run(ctx({ lead: "lead_1" }), { to: "owner" })).patch?.assigneeId).toBe("lead_1");
    expect((await h.run(ctx({ issue: { reporterId: "r2" } }), { to: "reporter" })).patch?.assigneeId).toBe("r2");
    expect((await h.run(ctx({}), { to: "unassigned" })).patch?.assigneeId).toBeNull();
    expect((await h.run(ctx({}), { to: "user_x" })).patch?.assigneeId).toBe("user_x");
  });
  it("validateConfig requires a target", () => {
    expect(h.validateConfig?.({})).toEqual(["Choose who to assign the work item to"]);
    expect(h.validateConfig?.({ to: "actor" })).toEqual([]);
  });
});

describe("copy_field action", () => {
  const h = POSTFUNCTION_REGISTRY.copy_field;
  it("copies within the same work item", async () => {
    const res = await h.run(ctx({ issue: { title: "Hello" } }), { source: "self", from: "title", to: "description" });
    expect(res.patch?.description).toBe("Hello");
  });
  it("copies from the parent work item", async () => {
    const res = await h.run(ctx({ parentField: "ParentDesc" }), { source: "parent", from: "description", to: "description" });
    expect(res.patch?.description).toBe("ParentDesc");
  });
  it("validateConfig requires from + to", () => {
    expect(h.validateConfig?.({})).toEqual(["Choose a field to copy from", "Choose a field to copy to"]);
  });
});

describe("update_field action", () => {
  const h = POSTFUNCTION_REGISTRY.update_field;
  it("replaces a text field", async () => {
    const res = await h.run(ctx({}), { field: "description", value: "New", mode: "replace" });
    expect(res.patch?.description).toBe("New");
  });
  it("appends when mode = add", async () => {
    const res = await h.run(ctx({ issue: { description: "A" } }), { field: "description", value: "B", mode: "add" });
    expect(res.patch?.description).toBe("AB");
  });
  it("clears the field", async () => {
    const res = await h.run(ctx({ issue: { description: "A" } }), { field: "description", clear: true });
    expect(res.patch?.description).toBeNull();
  });
  it("coerces numbers", async () => {
    const res = await h.run(ctx({}), { field: "storyPoints", value: "5" });
    expect(res.patch?.storyPoints).toBe(5);
  });
  it("validateConfig requires field + value (unless clearing)", () => {
    expect(h.validateConfig?.({ field: "description" })).toEqual(["Enter a value (or enable Clear this field)"]);
    expect(h.validateConfig?.({ field: "description", clear: true })).toEqual([]);
    expect(h.validateConfig?.({ field: "nope", value: "x" })).toEqual(["Choose a field"]);
  });
});
