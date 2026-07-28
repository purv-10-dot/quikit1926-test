/**
 * Built-in CONDITION handlers. Conditions gate transition availability and fail
 * silently (the transition is simply hidden). Registry key → handler.
 */
import type { ConditionHandler } from "./context";

/** is_assignee — only the current assignee may use the transition. */
const isAssignee: ConditionHandler = {
  evaluate: async (ctx) =>
    ctx.issue.assigneeId != null && ctx.issue.assigneeId === ctx.userId,
};

/** in_project_role — user must hold the named project role. config: { roleName } */
const inProjectRole: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const roleName = String(config.roleName ?? "");
    if (!roleName) return false;
    return ctx.prim.userInProjectRole(roleName);
  },
  validateConfig: (config) =>
    config.roleName ? [] : ["roleName is required for in_project_role"],
};

/** has_permission — user must hold (resource, action). config: { resource, action } */
const hasPermission: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const resource = String(config.resource ?? "");
    const action = String(config.action ?? "");
    if (!resource || !action) return false;
    return ctx.prim.userCanInProject(resource, action);
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!config.resource) errs.push("resource is required for has_permission");
    if (!config.action) errs.push("action is required for has_permission");
    return errs;
  },
};

export const CONDITION_REGISTRY: Record<string, ConditionHandler> = {
  is_assignee: isAssignee,
  in_project_role: inProjectRole,
  has_permission: hasPermission,
};
