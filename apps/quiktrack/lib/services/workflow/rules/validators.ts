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

export const VALIDATOR_REGISTRY: Record<string, ValidatorHandler> = {
  field_required: fieldRequired,
  permission_required: permissionRequired,
};
