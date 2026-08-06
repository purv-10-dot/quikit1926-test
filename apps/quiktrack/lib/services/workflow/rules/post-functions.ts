/**
 * Built-in POST-FUNCTION handlers. Post-functions run after the status change,
 * inside the commit transaction, in orderNo order. They return a patch merged
 * into the issue update. Registry key → handler.
 */
import type { PostFunctionHandler } from "./context";

/** set_resolution — set the issue's resolution. config: { resolutionId } */
const setResolution: PostFunctionHandler = {
  run: async (_ctx, config) => ({
    patch: { resolutionId: String(config.resolutionId ?? "") || null },
  }),
  validateConfig: (config) =>
    config.resolutionId ? [] : ["resolutionId is required for set_resolution"],
};

/** clear_resolution — reopen: set resolution back to null (open). */
const clearResolution: PostFunctionHandler = {
  run: async () => ({ patch: { resolutionId: null } }),
};

/**
 * assign — set the assignee. config: { to: "actor" | userId }. "actor" assigns
 * the person making the transition.
 */
const assign: PostFunctionHandler = {
  run: async (ctx, config) => {
    const to = String(config.to ?? "");
    const assigneeId = to === "actor" ? ctx.userId : to || null;
    return { patch: { assigneeId } };
  },
  validateConfig: (config) =>
    config.to ? [] : ['to is required for assign (a userId or "actor")'],
};

/** set_field — set priority (the one free-form scalar we expose in Phase 3). */
const setField: PostFunctionHandler = {
  run: async (_ctx, config) => {
    const field = String(config.fieldId ?? "");
    const value = config.value;
    if (field === "priority" && typeof value === "string") {
      return { patch: { priority: value } };
    }
    return {};
  },
  validateConfig: (config) =>
    config.fieldId ? [] : ["fieldId is required for set_field"],
};

/**
 * add_comment — append a comment to the issue on transition. config: { text }.
 * Supports {actor} (the acting user id) and {status} (the target status id)
 * tokens. The route persists the returned comment bodies in the same txn.
 */
const addComment: PostFunctionHandler = {
  run: async (ctx, config) => {
    const raw = String(config.text ?? "").trim();
    if (!raw) return {};
    const body = raw
      .replace(/\{actor\}/g, ctx.userId)
      .replace(/\{status\}/g, ctx.toStatusId);
    return { comments: [body] };
  },
  validateConfig: (config) =>
    config.text ? [] : ["text is required for add_comment"],
};

/**
 * show_screen — Jira "Show a screen" (Request input bucket). Stored as a
 * post-function so it lives on the transition, but it does NOT mutate the issue:
 * the "screen" is a client-side prompt shown before the move, so at runtime this
 * is a no-op. It exists in the registry so publish validation accepts it and can
 * require a chosen screen. config: { screenId }
 */
const showScreen: PostFunctionHandler = {
  run: async () => ({}),
  validateConfig: (config) =>
    config.screenId ? [] : ["Select a screen for the show_screen rule"],
};

export const POSTFUNCTION_REGISTRY: Record<string, PostFunctionHandler> = {
  set_resolution: setResolution,
  clear_resolution: clearResolution,
  assign,
  set_field: setField,
  add_comment: addComment,
  show_screen: showScreen,
};
