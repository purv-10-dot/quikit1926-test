/**
 * Option lists for the "Restrict who can move a work item" rule config.
 *
 * All three targets (users / roles / permissions) are CHOSEN from dropdowns —
 * no free typing — and every option is a value QuikTrack actually enforces:
 *   • users        — the special "assignee" token (the engine's
 *                    restrict_who_moves resolves it against issue.assigneeId).
 *   • roles        — the seeded project roles (Space Admin / Contributor /
 *                    Viewer), the only roles guaranteed to exist in every space.
 *   • permissions  — the real (resource, action) pairs from PERMISSION_TREE,
 *                    the same pairs userCanInProject checks against.
 */
import {
  PROJECT_PERMISSION_TREE,
  PROTECTED_PROJECT_ROLE_NAMES,
} from "@/lib/api/permissionsRegistry";

/** Special user tokens the engine can resolve (no real user directory here). */
export const USER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "assignee", label: "The work item's assignee" },
];

/** Seeded project roles — present in every space. */
export const ROLE_OPTIONS: Array<{ value: string; label: string }> =
  PROTECTED_PROJECT_ROLE_NAMES.map((r) => ({ value: r, label: r }));

const ACTION_LABEL: Record<string, string> = {
  view: "View",
  create: "Create",
  update: "Update",
  delete: "Delete",
};

/** A permission the rule can require, keyed by "Resource:action". */
export interface PermissionOption {
  key: string;
  resource: string;
  action: string;
  label: string;
}

/** Flatten the project permission tree into pickable (resource, action) pairs. */
export const PERMISSION_OPTIONS: PermissionOption[] = (() => {
  const out: PermissionOption[] = [];
  for (const mod of PROJECT_PERMISSION_TREE) {
    for (const leaf of mod.leaves ?? []) {
      for (const action of leaf.actions) {
        out.push({
          key: `${leaf.resource}:${action}`,
          resource: leaf.resource,
          action,
          label: `${leaf.label} · ${ACTION_LABEL[action] ?? action}`,
        });
      }
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
})();

export function permissionKey(p: { resource: string; action: string }): string {
  return `${p.resource}:${p.action}`;
}

/* ── "Restrict to when a field is a specific value" options ──────────────── */

/**
 * Fields the "Restrict to when a field is a specific value" rule can test —
 * ONLY fields QuikTrack has AND the rule engine can read from the issue snapshot
 * (RuleIssueSnapshot). Jira's Affects-versions / Components / Creator etc. are
 * intentionally omitted — we don't have them, and the engine can't evaluate them.
 *
 * `kind` drives the config form: the "Review its value as", "Check if it"
 * operators, and the value input all differ by field kind (text / number / date).
 */
export type FieldKind = "text" | "number" | "date";

export interface FieldOption {
  value: string;
  label: string;
  /** Snapshot key the engine compares against. */
  snapshotKey:
    | "type" | "priority" | "assigneeId" | "resolutionId" | "statusId"
    | "reporterId" | "title" | "description" | "storyPoints" | "eta"
    | "dueDate" | "startDate";
  kind: FieldKind;
}

export const FIELD_OPTIONS: FieldOption[] = [
  { value: "type", label: "Work item type", snapshotKey: "type", kind: "text" },
  { value: "priority", label: "Priority", snapshotKey: "priority", kind: "text" },
  { value: "status", label: "Status", snapshotKey: "statusId", kind: "text" },
  { value: "resolution", label: "Resolution", snapshotKey: "resolutionId", kind: "text" },
  { value: "assignee", label: "Assignee", snapshotKey: "assigneeId", kind: "text" },
  { value: "reporter", label: "Reporter", snapshotKey: "reporterId", kind: "text" },
  { value: "title", label: "Summary", snapshotKey: "title", kind: "text" },
  { value: "description", label: "Description", snapshotKey: "description", kind: "text" },
  { value: "storyPoints", label: "Story points", snapshotKey: "storyPoints", kind: "number" },
  { value: "eta", label: "ETA", snapshotKey: "eta", kind: "number" },
  { value: "dueDate", label: "Due date", snapshotKey: "dueDate", kind: "date" },
  { value: "startDate", label: "Start date", snapshotKey: "startDate", kind: "date" },
];

export function fieldOption(field: string): FieldOption | undefined {
  return FIELD_OPTIONS.find((f) => f.value === field);
}
export function fieldKind(field: string): FieldKind | null {
  return fieldOption(field)?.kind ?? null;
}
