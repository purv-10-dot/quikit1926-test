import type { RuleKind } from "../editor-types";

/**
 * The rule catalog for the Jira-style "Add rule" / "Edit Rule" UI: each of the
 * engine's rule types with a friendly label, description and its config fields.
 * `kind` maps to a Jira bucket: CONDITION → Restrict transition, VALIDATOR →
 * Validate details (+ Request input), POSTFUNCTION → Perform actions.
 *
 * Field descriptors drive the config forms. Kept 1:1 with the engine registries
 * in lib/services/workflow/rules/*.
 */
export type RuleFieldType = "text" | "resolution" | "assignee";

export interface RuleField {
  key: string;
  label: string;
  type: RuleFieldType;
  placeholder?: string;
  required?: boolean;
}

/**
 * Rail bucket ids. A superset of RuleKind: "REQUEST_INPUT" is a UI-only bucket
 * (Jira's "Request input") whose rules are stored as POSTFUNCTIONs — the engine
 * still has just 3 kinds, but the catalog rail shows 4 buckets.
 */
export type BucketId = RuleKind | "REQUEST_INPUT";

export interface RuleTypeMeta {
  kind: RuleKind;
  /** Rail bucket this rule appears under. Defaults to `kind` when omitted. */
  bucket?: BucketId;
  type: string;
  label: string;
  description: string;
  fields: RuleField[];
  /** When set, EditRuleDialog renders this bespoke form instead of `fields`. */
  customForm?:
    | "restrict_who_moves"
    | "restrict_subtask_status"
    | "restrict_from_all"
    | "restrict_field_value"
    | "restrict_been_through_status"
    | "restrict_previous_updater"
    | "validate_field"
    | "validate_been_through"
    | "validate_parent_status"
    | "validate_permission"
    | "show_screen";
}

/** Jira's 4 rule buckets shown in the Add-rule modal's left rail. */
export const RULE_BUCKETS: Array<{ id: BucketId; label: string; blurb: string }> = [
  {
    id: "CONDITION",
    label: "Restrict transition",
    blurb:
      "Hide the transition when certain conditions aren't met. Your team won't be able to use the transition or see it in the work item's status dropdown.",
  },
  {
    id: "REQUEST_INPUT",
    label: "Request input",
    blurb: "Request input from the user before the work item moves.",
  },
  {
    id: "VALIDATOR",
    label: "Validate details",
    blurb: "Validate details before allowing the work item to move.",
  },
  {
    id: "POSTFUNCTION",
    label: "Perform actions",
    blurb: "Perform actions automatically when the work item moves.",
  },
];

export const RULE_TYPE_META: RuleTypeMeta[] = [
  // ── CONDITION → Restrict transition (Jira catalog) ──────────────────────
  {
    kind: "CONDITION",
    type: "restrict_who_moves",
    label: "Restrict who can move a work item",
    description: "Only allow certain people to move a work item using a particular transition.",
    fields: [],
    customForm: "restrict_who_moves",
  },
  {
    kind: "CONDITION",
    type: "restrict_subtask_status",
    label: "Restrict based on the status of subtasks",
    description: "Only allow a work item to be transitioned when its subtasks have a specific status.",
    fields: [],
    customForm: "restrict_subtask_status",
  },
  {
    kind: "CONDITION",
    type: "restrict_from_all",
    label: "Restrict from all users",
    description: "Don't allow anyone to move a work item using a particular transition (can include APIs).",
    fields: [],
    customForm: "restrict_from_all",
  },
  {
    kind: "CONDITION",
    type: "restrict_field_value",
    label: "Restrict to when a field is a specific value",
    description: "Only allow a work item to be moved using a particular transition when a field is a specific value or range of values.",
    fields: [],
    customForm: "restrict_field_value",
  },
  {
    kind: "CONDITION",
    type: "restrict_been_through_status",
    label: "Restrict to when a work item has been through a specific status",
    description: "Only allow a work item to be moved using a particular transition if a work item has had a specific status.",
    fields: [],
    customForm: "restrict_been_through_status",
  },
  {
    kind: "CONDITION",
    type: "restrict_previous_updater",
    label: "Restrict users who have previously updated a work item's status",
    description: "Only allow people who haven't moved a work item between two statuses to move a work item using a particular transition.",
    fields: [],
    customForm: "restrict_previous_updater",
  },
  // ── VALIDATOR → Validate details (Jira catalog) ─────────────────────────
  {
    kind: "VALIDATOR",
    type: "validate_field",
    label: "Validate a field",
    description: "Ensure that a field is a certain value when moving a work item using a particular transition.",
    fields: [],
    customForm: "validate_field",
  },
  {
    kind: "VALIDATOR",
    type: "validate_been_through",
    label: "Validate that a work item has been through a specific status",
    description: "Ensure that a work item has been through a specific status when moving a work item.",
    fields: [],
    customForm: "validate_been_through",
  },
  {
    kind: "VALIDATOR",
    type: "validate_parent_status",
    label: "Validate that parent work items are in a specific status",
    description: "Ensure that a work item's parent has a specific status when moving a work item.",
    fields: [],
    customForm: "validate_parent_status",
  },
  {
    kind: "VALIDATOR",
    type: "validate_permission",
    label: "Validate that people have a specific permission",
    description: "Ensure people have a specific permission when moving a work item using a particular transition.",
    fields: [],
    customForm: "validate_permission",
  },
  // ── REQUEST_INPUT → Request input (stored as a POSTFUNCTION) ─────────────
  {
    kind: "POSTFUNCTION",
    bucket: "REQUEST_INPUT",
    type: "show_screen",
    label: "Show a screen",
    description: "Allow people to update fields in a screen before they move a work item.",
    fields: [],
    customForm: "show_screen",
  },
  // ── POSTFUNCTION → Perform actions ──────────────────────────────────────
  {
    kind: "POSTFUNCTION",
    type: "set_resolution",
    label: "Set resolution",
    description: "Automatically set the resolution when the work item moves.",
    fields: [{ key: "resolutionId", label: "Resolution", type: "resolution", required: true }],
  },
  {
    kind: "POSTFUNCTION",
    type: "clear_resolution",
    label: "Clear resolution",
    description: "Automatically clear the resolution field (e.g. on reopen).",
    fields: [],
  },
  {
    kind: "POSTFUNCTION",
    type: "assign",
    label: "Assign the work item",
    description: "Automatically assign the work item when it moves.",
    fields: [{ key: "to", label: "Assign to", type: "assignee", required: true }],
  },
  {
    kind: "POSTFUNCTION",
    type: "set_field",
    label: "Update a work item field",
    description: "Automatically set a field's value when the work item moves.",
    fields: [
      { key: "fieldId", label: "Field", type: "text", required: true },
      { key: "value", label: "Value", type: "text", required: true },
    ],
  },
  {
    kind: "POSTFUNCTION",
    type: "add_comment",
    label: "Add a comment",
    description: "Automatically add a comment when the work item moves.",
    fields: [{ key: "text", label: "Comment", type: "text", required: true }],
  },
];

export function metaFor(type: string): RuleTypeMeta | undefined {
  return RULE_TYPE_META.find((m) => m.type === type);
}

export function bucketLabel(kind: RuleKind): string {
  return RULE_BUCKETS.find((b) => b.id === kind)?.label ?? kind;
}
