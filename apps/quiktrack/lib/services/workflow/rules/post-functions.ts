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
 * assign — Jira "Assign a work item". Sets (or clears) the assignee after the
 * move. config: { to } where `to` is a special token or a user id:
 *   "actor"      → the person making the transition (Current user)
 *   "owner"      → the space owner / project lead (via prim.projectLeadId)
 *   "reporter"   → the work item's reporter
 *   "unassigned" → clear the assignee
 *   <userId>     → that specific user
 */
const assign: PostFunctionHandler = {
  run: async (ctx, config) => {
    const to = String(config.to ?? "");
    let assigneeId: string | null;
    switch (to) {
      case "actor": assigneeId = ctx.userId; break;
      case "owner": assigneeId = await ctx.prim.projectLeadId(); break;
      case "reporter": assigneeId = ctx.issue.reporterId ?? null; break;
      case "unassigned": assigneeId = null; break;
      default: assigneeId = to || null;
    }
    return { patch: { assigneeId } };
  },
  validateConfig: (config) =>
    config.to ? [] : ["Choose who to assign the work item to"],
};

/**
 * set_field — legacy "Set field" (priority only). Kept for the older rule-form
 * UI + existing published workflows; the Jira "Update a work item field" rule
 * (update_field) supersedes it in the new catalog.
 */
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

/* ── Shared field map for copy_field / update_field ─────────────────────── */

type PatchKey =
  | "assigneeId" | "resolutionId" | "priority" | "reporterId"
  | "title" | "description" | "storyPoints" | "eta" | "dueDate" | "startDate";

const FIELD_TO_PATCH: Record<string, { key: PatchKey; kind: "text" | "number" | "date" | "ref" }> = {
  priority: { key: "priority", kind: "ref" },
  assignee: { key: "assigneeId", kind: "ref" },
  reporter: { key: "reporterId", kind: "ref" },
  resolution: { key: "resolutionId", kind: "ref" },
  title: { key: "title", kind: "text" },
  // "Summary" is the workflow UI's (Jira) label for the work item's name; the
  // column is `title`. Without this alias a Summary→X copy rule silently no-ops.
  summary: { key: "title", kind: "text" },
  description: { key: "description", kind: "text" },
  storyPoints: { key: "storyPoints", kind: "number" },
  eta: { key: "eta", kind: "number" },
  dueDate: { key: "dueDate", kind: "date" },
  startDate: { key: "startDate", kind: "date" },
};

/** Coerce a string value into the patch shape for a field kind. */
function coerce(kind: "text" | "number" | "date" | "ref", raw: string | null): unknown {
  if (raw == null || raw === "") return kind === "text" || kind === "ref" ? (raw ?? null) : null;
  if (kind === "number") { const n = Number(raw); return Number.isNaN(n) ? null : n; }
  return raw; // text / ref / date (ISO string) pass through
}

/**
 * copy_field — Jira "Copy the value of one field to another". Copies `from`→`to`
 * on the same work item (source "self") or from its parent (source "parent").
 * config: { source: "self" | "parent", from, to }
 */
const copyField: PostFunctionHandler = {
  run: async (ctx, config) => {
    const source = String(config.source ?? "self");
    const fromSpec = FIELD_TO_PATCH[String(config.from ?? "")];
    const toSpec = FIELD_TO_PATCH[String(config.to ?? "")];
    if (!fromSpec || !toSpec) return {};
    const issue = ctx.issue as unknown as Record<string, unknown>;
    let value: string | null;
    if (source === "parent") {
      value = await ctx.prim.parentFieldValue(fromSpec.key);
    } else {
      const v = issue[fromSpec.key];
      value = v == null ? null : String(v);
    }
    return { patch: { [toSpec.key]: coerce(toSpec.kind, value) } as never };
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!FIELD_TO_PATCH[String(config.from ?? "")]) errs.push("Choose a field to copy from");
    if (!FIELD_TO_PATCH[String(config.to ?? "")]) errs.push("Choose a field to copy to");
    return errs;
  },
};

/**
 * update_field — Jira "Update a work item field". Sets a field's value after the
 * move. config: { field, value, mode: "add" | "replace", clear }
 *   clear → set the field empty/null.
 *   mode "add" → for text fields, append to the current value; else same as replace.
 */
const updateField: PostFunctionHandler = {
  run: async (ctx, config) => {
    const spec = FIELD_TO_PATCH[String(config.field ?? "")];
    if (!spec) return {};
    if (config.clear === true) {
      return { patch: { [spec.key]: null } as never };
    }
    const raw = String(config.value ?? "");
    if (spec.kind === "text" && String(config.mode ?? "replace") === "add") {
      const issue = ctx.issue as unknown as Record<string, unknown>;
      const current = issue[spec.key];
      const combined = `${current == null ? "" : String(current)}${raw}`;
      return { patch: { [spec.key]: combined } as never };
    }
    return { patch: { [spec.key]: coerce(spec.kind, raw) } as never };
  },
  validateConfig: (config) => {
    const errs: string[] = [];
    if (!FIELD_TO_PATCH[String(config.field ?? "")]) errs.push("Choose a field");
    if (config.clear !== true && String(config.value ?? "").trim() === "") {
      errs.push("Enter a value (or enable Clear this field)");
    }
    return errs;
  },
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
  copy_field: copyField,
  update_field: updateField,
  set_field: setField,
  add_comment: addComment,
  show_screen: showScreen,
};
