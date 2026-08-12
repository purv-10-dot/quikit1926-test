import type { EditorRule } from "../editor-types";
import { metaFor } from "./rule-catalog";
import { screenFieldLabel } from "@/lib/services/screens/field-registry";

/** Human labels for the field-value / action field keys used in configs. */
const FIELD_LABEL: Record<string, string> = {
  type: "Work item type", priority: "Priority", status: "Status", resolution: "Resolution",
  assignee: "Assignee", reporter: "Reporter", title: "Summary", description: "Description",
  storyPoints: "Story points", eta: "ETA", dueDate: "Due date", startDate: "Start date",
};
const fieldLabel = (k: unknown) => FIELD_LABEL[String(k ?? "")] ?? screenFieldLabel(String(k ?? ""));

const ASSIGN_LABEL: Record<string, string> = {
  actor: "the current user", owner: "the space owner", reporter: "the reporter", unassigned: "no one (unassigned)",
};

/**
 * A short, config-specific description of a configured rule for its panel card
 * (e.g. 'Automatically clear the Resolution field'). Falls back to the rule
 * type's generic description when there's nothing config-specific to say.
 */
export function ruleSummary(rule: EditorRule): string {
  const c = (rule.config ?? {}) as Record<string, unknown>;
  switch (rule.type) {
    case "show_screen":
      return "Update fields in the selected screen";
    case "assign": {
      const to = String(c.to ?? "");
      if (!to) return "Assign the work item";
      return `Assign the work item to ${ASSIGN_LABEL[to] ?? "a specific user"}`;
    }
    case "copy_field": {
      if (!c.from || !c.to) return "Copy the value of one field to another";
      const src = c.source === "parent" ? " from the parent" : "";
      return `Copy ${fieldLabel(c.from)}${src} into ${fieldLabel(c.to)}`;
    }
    case "update_field": {
      if (!c.field) return "Update a work item field";
      if (c.clear === true) return `Automatically clear the ${fieldLabel(c.field)} field`;
      return `Automatically set the ${fieldLabel(c.field)} field`;
    }
    case "restrict_field_value":
      return c.field ? `Only when ${fieldLabel(c.field)} matches a value` : "";
    case "restrict_been_through_status":
    case "validate_been_through":
      return "Based on the statuses the work item has been through";
    case "validate_parent_status":
      return "Based on the parent work item's status";
    case "validate_field":
      return c.field ? `Validate the ${fieldLabel(c.field)} field` : "";
    default:
      return metaFor(rule.type)?.description ?? "";
  }
}
