/**
 * Built-in VALIDATOR handlers. Validators run at execution time and fail loudly
 * (422, abort before any write). Registry key → handler.
 */
import type { ValidatorHandler } from "./context";

/**
 * The field value a validator inspects: prefer the submitted input, else the
 * stored issue value. Supports the engine-managed fields plus `resolutionId`
 * (the canonical "resolution required on Done" case).
 */
function resolveFieldValue(
  fieldId: string,
  ctx: { inputs: Record<string, unknown>; issue: Record<string, unknown> },
): unknown {
  if (fieldId in ctx.inputs) return ctx.inputs[fieldId];
  return ctx.issue[fieldId];
}

/** field_required — a field must be non-empty. config: { fieldId } */
const fieldRequired: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const fieldId = String(config.fieldId ?? "");
    if (!fieldId) return null;
    const value = resolveFieldValue(fieldId, {
      inputs: ctx.inputs,
      issue: ctx.issue as unknown as Record<string, unknown>,
    });
    const empty = value === null || value === undefined || value === "";
    return empty
      ? { field: fieldId, message: errorMessage || `${fieldId} is required.` }
      : null;
  },
  validateConfig: (config) =>
    config.fieldId ? [] : ["fieldId is required for field_required"],
};

/** permission_required — user must hold (resource, action). config: { resource, action } */
const permissionRequired: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const resource = String(config.resource ?? "");
    const action = String(config.action ?? "");
    if (!resource || !action) return null;
    const ok = await ctx.prim.userCanInProject(resource, action);
    return ok
      ? null
      : { message: errorMessage || `You lack permission (${resource}:${action}).` };
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!config.resource) errs.push("resource is required for permission_required");
    if (!config.action) errs.push("action is required for permission_required");
    return errs;
  },
};

/** field_regex — a field must match a pattern. config: { fieldId, pattern } */
const fieldRegex: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const fieldId = String(config.fieldId ?? "");
    const pattern = String(config.pattern ?? "");
    if (!fieldId || !pattern) return null;
    const value = resolveFieldValue(fieldId, {
      inputs: ctx.inputs,
      issue: ctx.issue as unknown as Record<string, unknown>,
    });
    // Empty value is a "required" concern, not a "format" concern — pass here.
    if (value === null || value === undefined || value === "") return null;
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      // A bad pattern shouldn't have saved (validateConfig catches it), but if
      // it slips through, fail the transition loudly rather than silently pass.
      return { field: fieldId, message: errorMessage || `Invalid pattern for ${fieldId}.` };
    }
    return re.test(String(value))
      ? null
      : { field: fieldId, message: errorMessage || `${fieldId} does not match the required format.` };
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!config.fieldId) errs.push("fieldId is required for field_regex");
    if (!config.pattern) {
      errs.push("pattern is required for field_regex");
    } else {
      try {
        new RegExp(String(config.pattern));
      } catch {
        errs.push("pattern is not a valid regular expression");
      }
    }
    return errs;
  },
};

/* ── Jira "Validate details" bucket ─────────────────────────────────────── */

/** Fields the validators can inspect on the issue snapshot. */
const FIELD_SNAP: Record<string, string> = {
  type: "type", priority: "priority", status: "statusId", resolution: "resolutionId",
  assignee: "assigneeId", reporter: "reporterId", title: "title", description: "description",
  storyPoints: "storyPoints", eta: "eta", dueDate: "dueDate", startDate: "startDate",
};

function snapValue(field: string, ctx: { inputs: Record<string, unknown>; issue: Record<string, unknown> }): unknown {
  const key = FIELD_SNAP[field];
  if (!key) return undefined;
  if (key in ctx.inputs) return ctx.inputs[key];
  return ctx.issue[key];
}
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * validate_field — Jira "Validate a field". Ensure a field satisfies a check
 * when moving. config: { field, check, pattern?, otherField? }
 *   check: "single_value" | "not_empty" | "compares_date" | "modified" | "regex"
 *     • single_value / not_empty — field must be non-empty (our fields are scalar,
 *       so "has a single value" == "isn't empty").
 *     • regex — field must match `pattern`.
 *     • modified — the field must be changed by this transition (present in inputs
 *       and different from the stored value).
 *     • compares_date — this (date) field must be ≤ `otherField` (date). Passes if
 *       either is empty.
 */
const validateField: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const field = String(config.field ?? "");
    const check = String(config.check ?? "");
    if (!field || !check) return null;
    const issue = ctx.issue as unknown as Record<string, unknown>;
    const value = snapValue(field, { inputs: ctx.inputs, issue });
    const fail = (msg: string) => ({ field, message: errorMessage || msg });

    if (check === "single_value" || check === "not_empty") {
      return isEmpty(value) ? fail(`${field} must have a value.`) : null;
    }
    if (check === "regex") {
      const pattern = String(config.pattern ?? "");
      if (isEmpty(value) || !pattern) return null;
      try {
        return new RegExp(pattern).test(String(value)) ? null : fail(`${field} doesn't match the required format.`);
      } catch {
        return fail(`Invalid pattern for ${field}.`);
      }
    }
    if (check === "modified") {
      const key = FIELD_SNAP[field];
      const changed = key != null && key in ctx.inputs && ctx.inputs[key] !== issue[key];
      return changed ? null : fail(`${field} must be modified.`);
    }
    if (check === "compares_date") {
      const other = String(config.otherField ?? "");
      const otherVal = snapValue(other, { inputs: ctx.inputs, issue });
      if (isEmpty(value) || isEmpty(otherVal)) return null;
      const a = Date.parse(String(value));
      const b = Date.parse(String(otherVal));
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      return a <= b ? null : fail(`${field} must not be after ${other}.`);
    }
    return null;
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!FIELD_SNAP[String(config.field ?? "")]) errs.push("Choose a field");
    const check = String(config.check ?? "");
    if (!["single_value", "not_empty", "compares_date", "modified", "regex"].includes(check)) {
      errs.push("Choose what to validate");
    }
    if (check === "regex") {
      const p = String(config.pattern ?? "");
      if (!p) errs.push("Enter a regular expression");
      else { try { new RegExp(p); } catch { errs.push("Pattern is not a valid regular expression"); } }
    }
    if (check === "compares_date" && !FIELD_SNAP[String(config.otherField ?? "")]) {
      errs.push("Choose a field to compare against");
    }
    return errs;
  },
};

/**
 * validate_been_through — Jira "Validate that a work item has been through a
 * specific status". Loud version of the availability rule.
 * config: { statusIds: string[], mostRecentOnly?: boolean }
 */
const validateBeenThrough: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const wanted = new Set(Array.isArray(config.statusIds) ? (config.statusIds as string[]) : []);
    if (wanted.size === 0) return null;
    const history = await ctx.prim.transitionHistory();
    const current = ctx.issue.statusId;
    const entered = history.map((h) => h.toStatusId).filter((s) => s !== current);
    const considered = config.mostRecentOnly === true
      ? (entered.length > 0 ? [entered[entered.length - 1]] : [])
      : entered;
    const ok = considered.some((s) => wanted.has(s));
    return ok ? null : { message: errorMessage || "This work item hasn't been through the required status." };
  },
  validateConfig: (config) =>
    Array.isArray(config.statusIds) && config.statusIds.length > 0 ? [] : ["Pick at least one status"],
};

/**
 * validate_parent_status — Jira "Validate that parent work items are in a
 * specific status". config: { statusIds: string[] }. Passes when the item has no
 * parent (nothing to check), else the parent's status must be one of the chosen.
 */
const validateParentStatus: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const wanted = new Set(Array.isArray(config.statusIds) ? (config.statusIds as string[]) : []);
    if (wanted.size === 0) return null;
    const parent = await ctx.prim.parentStatusId();
    if (parent == null) return null; // no parent → nothing to validate
    return wanted.has(parent)
      ? null
      : { message: errorMessage || "The parent work item isn't in a required status." };
  },
  validateConfig: (config) =>
    Array.isArray(config.statusIds) && config.statusIds.length > 0 ? [] : ["Pick at least one status"],
};

/**
 * validate_permission — Jira "Validate that people have a specific permission".
 * config: { resource, action } (a real PERMISSION_TREE pair). Loud sibling of
 * restrict_who_moves's permission target.
 */
const validatePermission: ValidatorHandler = {
  validate: async (ctx, config, errorMessage) => {
    const resource = String(config.resource ?? "");
    const action = String(config.action ?? "");
    if (!resource || !action) return null;
    const ok = await ctx.prim.userCanInProject(resource, action);
    return ok ? null : { message: errorMessage || `You lack permission (${resource}:${action}).` };
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!config.resource) errs.push("Choose a permission");
    if (!config.action) errs.push("Choose a permission");
    return errs;
  },
};

export const VALIDATOR_REGISTRY: Record<string, ValidatorHandler> = {
  field_required: fieldRequired,
  permission_required: permissionRequired,
  field_regex: fieldRegex,
  validate_field: validateField,
  validate_been_through: validateBeenThrough,
  validate_parent_status: validateParentStatus,
  validate_permission: validatePermission,
};
