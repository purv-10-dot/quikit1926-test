import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_who_moves;

/** Build a RuleContext with stubbed primitives. */
function ctx(overrides: {
  userId?: string;
  assigneeId?: string | null;
  roles?: string[];
  perms?: Array<[string, string]>;
}): RuleContext {
  const roles = new Set(overrides.roles ?? []);
  const perms = new Set((overrides.perms ?? []).map(([r, a]) => `${r}:${a}`));
  return {
    userId: overrides.userId ?? "u1",
    issue: {
      id: "i1",
      orgId: "o1",
      projectId: "p1",
      type: "TASK",
      statusId: "s1",
      assigneeId: overrides.assigneeId ?? null,
      resolutionId: null,
      priority: null,
    },
    toStatusId: "s2",
    toStatusCategory: "IN_PROGRESS",
    inputs: {},
    prim: {
      userInProjectRole: async (roleName) => roles.has(roleName),
      userCanInProject: async (resource, action) => perms.has(`${resource}:${action}`),
      subtaskStatusIds: async () => [],
      transitionHistory: async () => [],
      parentStatusId: async () => null,
      projectLeadId: async () => null,
      parentFieldValue: async () => null,
    },
  };
}

describe("restrict_who_moves condition", () => {
  it("validateConfig requires a restrictTo + a value", () => {
    expect(handler.validateConfig?.({})).toEqual(["restrictTo is required for restrict_who_moves"]);
    expect(handler.validateConfig?.({ restrictTo: "users", userIds: [] })).toEqual(["Pick at least one user"]);
    expect(handler.validateConfig?.({ restrictTo: "users", userIds: ["u1"] })).toEqual([]);
  });

  it("users: passes only for listed user ids", async () => {
    const config = { restrictTo: "users", userIds: ["u1", "u2"] };
    expect(await handler.evaluate(ctx({ userId: "u1" }), config)).toBe(true);
    expect(await handler.evaluate(ctx({ userId: "u9" }), config)).toBe(false);
  });

  it("users: the 'assignee' token passes when the actor is the assignee", async () => {
    const config = { restrictTo: "users", userIds: ["assignee"] };
    expect(await handler.evaluate(ctx({ userId: "u1", assigneeId: "u1" }), config)).toBe(true);
    expect(await handler.evaluate(ctx({ userId: "u1", assigneeId: "u2" }), config)).toBe(false);
  });

  it("roles: passes when the actor holds any configured role", async () => {
    const config = { restrictTo: "roles", roleNames: ["Space Admin", "Contributor"] };
    expect(await handler.evaluate(ctx({ roles: ["Contributor"] }), config)).toBe(true);
    expect(await handler.evaluate(ctx({ roles: ["Viewer"] }), config)).toBe(false);
  });

  it("permissions: passes when the actor holds any configured (resource, action)", async () => {
    const config = { restrictTo: "permissions", permissions: [{ resource: "Issue", action: "update" }] };
    expect(await handler.evaluate(ctx({ perms: [["Issue", "update"]] }), config)).toBe(true);
    expect(await handler.evaluate(ctx({ perms: [["Issue", "view"]] }), config)).toBe(false);
  });

  it("groups / custom-field: not enforced yet → fails safe (false)", async () => {
    expect(await handler.evaluate(ctx({}), { restrictTo: "groups", groupNames: ["dev"] })).toBe(false);
    expect(await handler.evaluate(ctx({}), { restrictTo: "users_in_field", fieldId: "f1" })).toBe(false);
  });
});
