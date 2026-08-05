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

/**
 * restrict_who_moves — Jira "Restrict who can move a work item". A single
 * condition covering the common "Restrict to" targets. The user passes if they
 * match ANY of the configured targets (Jira treats the sub-conditions as OR).
 *
 * config: {
 *   restrictTo: "users" | "roles" | "permissions" | "groups"
 *               | "users_in_field" | "groups_in_field",
 *   // one of, depending on restrictTo:
 *   userIds?: string[],           // "users" — plus the special "assignee" token
 *   roleNames?: string[],         // "roles"
 *   permissions?: { resource: string; action: string }[], // "permissions"
 *   groupNames?: string[],        // "groups"      (needs userInGroup primitive)
 *   fieldId?: string,             // "users_in_field" / "groups_in_field"
 * }
 *
 * Enforced targets: users (incl. the "assignee" token), roles, permissions.
 * groups / custom-field targets require additional primitives — until those
 * exist the engine treats an unknown/unsupported target as NOT satisfied (fail
 * safe), so the rule never silently lets everyone through.
 */
const restrictWhoMoves: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const restrictTo = String(config.restrictTo ?? "");
    switch (restrictTo) {
      case "users": {
        const ids = Array.isArray(config.userIds) ? (config.userIds as string[]) : [];
        // "assignee" token → the acting user is the current assignee.
        if (ids.includes("assignee") && ctx.issue.assigneeId != null && ctx.issue.assigneeId === ctx.userId) {
          return true;
        }
        return ids.includes(ctx.userId);
      }
      case "roles": {
        const roles = Array.isArray(config.roleNames) ? (config.roleNames as string[]) : [];
        for (const r of roles) {
          if (r && (await ctx.prim.userInProjectRole(r))) return true;
        }
        return false;
      }
      case "permissions": {
        const perms = Array.isArray(config.permissions)
          ? (config.permissions as { resource: string; action: string }[])
          : [];
        for (const p of perms) {
          if (p?.resource && p?.action && (await ctx.prim.userCanInProject(p.resource, p.action))) {
            return true;
          }
        }
        return false;
      }
      // groups / custom-field targets need primitives we don't have yet.
      default:
        return false;
    }
  },
  validateConfig: (config) => {
    const restrictTo = String(config.restrictTo ?? "");
    const supported = ["users", "roles", "permissions", "groups", "users_in_field", "groups_in_field"];
    if (!supported.includes(restrictTo)) return ["restrictTo is required for restrict_who_moves"];
    if (restrictTo === "users" && !(Array.isArray(config.userIds) && config.userIds.length > 0))
      return ["Pick at least one user"];
    if (restrictTo === "roles" && !(Array.isArray(config.roleNames) && config.roleNames.length > 0))
      return ["Pick at least one role"];
    if (restrictTo === "permissions" && !(Array.isArray(config.permissions) && config.permissions.length > 0))
      return ["Pick at least one permission"];
    return [];
  },
};

/**
 * restrict_subtask_status — Jira "Restrict based on the status of subtasks".
 * Allow the transition only when EVERY subtask is in one of the chosen statuses.
 * A work item with no subtasks passes. config: { statusIds: string[] }
 */
const restrictSubtaskStatus: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const allowed = new Set(Array.isArray(config.statusIds) ? (config.statusIds as string[]) : []);
    if (allowed.size === 0) return true; // nothing selected → no restriction
    const subs = await ctx.prim.subtaskStatusIds();
    if (subs.length === 0) return true; // no subtasks → nothing to block
    return subs.every((s) => allowed.has(s));
  },
  validateConfig: (config) =>
    Array.isArray(config.statusIds) && config.statusIds.length > 0
      ? []
      : ["Pick at least one subtask status"],
};

/**
 * restrict_from_all — Jira "Restrict from all users". Blocks EVERYONE from using
 * the transition. config: { mode: "allow_apis" | "including_apis" }
 *   • allow_apis     — humans blocked, API/automation actors allowed.
 *   • including_apis — everyone blocked, no exceptions.
 *
 * QuikTrack has no API/automation actor today, so both modes block every real
 * (human) caller. The `allow_apis` exemption is wired against ctx.isApiActor
 * (currently always false) so it starts exempting automation the moment an
 * API-actor flag is threaded into the transition path — no behaviour change now.
 */
const restrictFromAll: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const mode = String(config.mode ?? "including_apis");
    if (mode === "allow_apis" && ctx.isApiActor) return true;
    return false;
  },
  validateConfig: (config) => {
    const mode = String(config.mode ?? "");
    return mode === "allow_apis" || mode === "including_apis"
      ? []
      : ["Choose whether to restrict from all users but allow APIs, or including APIs"];
  },
};

/**
 * restrict_field_value — Jira "Restrict to when a field is a specific value".
 * The transition is available only when the chosen field satisfies the operator
 * against the configured value.
 *
 * config: {
 *   field: "type" | "priority" | "assignee" | "resolution" | "status",
 *   valueType: "text" | "number",
 *   op: "eq" | "neq",
 *   value: string,
 * }
 *
 * Only fields readable from the issue snapshot are supported (the UI offers
 * exactly these). An unknown field fails safe (transition hidden).
 */
const FIELD_TO_SNAPSHOT: Record<string, "type" | "priority" | "assigneeId" | "resolutionId" | "statusId"> = {
  type: "type",
  priority: "priority",
  assignee: "assigneeId",
  resolution: "resolutionId",
  status: "statusId",
};

const restrictFieldValue: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const field = String(config.field ?? "");
    const key = FIELD_TO_SNAPSHOT[field];
    if (!key) return false; // unknown field → fail safe
    const op = String(config.op ?? "eq");
    const valueType = String(config.valueType ?? "text");
    const target = String(config.value ?? "");
    const actual = ctx.issue[key]; // string | null

    let equal: boolean;
    if (valueType === "number") {
      const a = actual == null ? NaN : Number(actual);
      const b = target === "" ? NaN : Number(target);
      // NaN never equals anything → an unset field is "not equal" to any number.
      equal = !Number.isNaN(a) && !Number.isNaN(b) && a === b;
    } else {
      equal = (actual ?? "") === target;
    }
    return op === "neq" ? !equal : equal;
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!FIELD_TO_SNAPSHOT[String(config.field ?? "")]) errs.push("Choose a field");
    const op = String(config.op ?? "");
    if (op !== "eq" && op !== "neq") errs.push("Choose whether it equals or doesn't equal");
    if (String(config.value ?? "").trim() === "") errs.push("Enter a value to compare against");
    return errs;
  },
};

/**
 * restrict_been_through_status — Jira "Restrict to when a work item has been
 * through a specific status". Available only when the work item's status history
 * has (or, when reversed, has NOT) passed through one of the chosen statuses.
 *
 * config: {
 *   statusIds: string[],
 *   includeCurrent?: boolean,   // also count the item's current status
 *   reverse?: boolean,          // allow only if it has NOT been through them
 *   mostRecentOnly?: boolean,   // only check the status just prior to current
 *   ignoreLoops?: boolean,      // when mostRecentOnly: skip transitions whose
 *                               // target equals the current status (loops)
 * }
 *
 * "Been through" = the target status of each recorded transition (the statuses
 * the item has entered). With no history and no includeCurrent, the item hasn't
 * been through anything.
 */
const restrictBeenThroughStatus: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const wanted = new Set(Array.isArray(config.statusIds) ? (config.statusIds as string[]) : []);
    if (wanted.size === 0) return true; // nothing selected → no restriction

    const includeCurrent = config.includeCurrent === true;
    const reverse = config.reverse === true;
    const mostRecentOnly = config.mostRecentOnly === true;
    const ignoreLoops = config.ignoreLoops === true;

    const history = await ctx.prim.transitionHistory();
    const current = ctx.issue.statusId;
    const enteredRaw = history.map((h) => h.toStatusId);

    let considered: string[];
    if (mostRecentOnly) {
      // "Only consider the most recent status" = the status set just prior to
      // the current one. The transition log's trailing entry is the arrival at
      // the current status, so drop that self-arrival, then take the last one.
      // ignoreLoops additionally skips any loop transition landing back on the
      // current status, so the "most recent" is the last genuinely different one.
      const prior = enteredRaw.filter((s) => s !== current);
      const recent = ignoreLoops ? prior : enteredRaw.slice(0, -1);
      considered = recent.length > 0 ? [recent[recent.length - 1]] : [];
    } else {
      // "Been through" means PAST statuses — exclude the current status from the
      // base set (it's added back only when includeCurrent is set).
      considered = enteredRaw.filter((s) => s !== current);
    }
    if (includeCurrent) considered.push(current);

    const hasBeenThrough = considered.some((s) => wanted.has(s));
    return reverse ? !hasBeenThrough : hasBeenThrough;
  },
  validateConfig: (config) =>
    Array.isArray(config.statusIds) && config.statusIds.length > 0
      ? []
      : ["Pick at least one status"],
};

/**
 * restrict_previous_updater — Jira "Restrict users who have previously updated a
 * work item's status". Blocks the acting user when THEY previously made a status
 * change matching (fromStatusId → toStatusId) on this work item. Everyone who
 * hasn't made that specific move may use the transition.
 *
 * config: {
 *   fromStatusId: string | "any",  // the source status of the prior change
 *                                  //   ("any" = from any status)
 *   toStatusId: string,            // the target status of the prior change
 * }
 *
 * Fails safe (available) when toStatusId is unset — nothing to match against.
 */
const restrictPreviousUpdater: ConditionHandler = {
  evaluate: async (ctx, config) => {
    const from = String(config.fromStatusId ?? "");
    const to = String(config.toStatusId ?? "");
    if (!to) return true; // incomplete config → no restriction

    const history = await ctx.prim.transitionHistory();
    const madeThatMove = history.some(
      (h) =>
        h.actorId != null &&
        h.actorId === ctx.userId &&
        h.toStatusId === to &&
        (from === "" || from === "any" || h.fromStatusId === from),
    );
    // If the acting user has previously made this move, block them.
    return !madeThatMove;
  },
  validateConfig: (config) =>
    String(config.toStatusId ?? "").trim() ? [] : ["Choose the 'to' status"],
};

export const CONDITION_REGISTRY: Record<string, ConditionHandler> = {
  is_assignee: isAssignee,
  in_project_role: inProjectRole,
  has_permission: hasPermission,
  restrict_who_moves: restrictWhoMoves,
  restrict_subtask_status: restrictSubtaskStatus,
  restrict_from_all: restrictFromAll,
  restrict_field_value: restrictFieldValue,
  restrict_been_through_status: restrictBeenThroughStatus,
  restrict_previous_updater: restrictPreviousUpdater,
};
