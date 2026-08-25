/**
 * Static TQL field data — single source of truth for both the translator's
 * error messages and the Settings → TQL Documentation page, so documentation can never
 * drift from what's actually implemented.
 *
 * Field names are canonical, lower-case. `aliases` maps additional
 * lower-case spellings (from the Jira reference grammar) onto the same
 * canonical name.
 */

export type NativeFieldKind =
  | "equality" // scalar column, native ids or enum strings
  | "text" // ~ / !~ only (title/description)
  | "textSearch" // ~ only, OR-across-columns ("text" master field)
  | "date"
  | "link"
  | "attachment";

export interface NativeFieldSpec {
  /** Canonical lower-case field name. */
  name: string;
  kind: NativeFieldKind;
  /** True if usable in ORDER BY. */
  sortable: boolean;
}

export const NATIVE_FIELD_ALIASES: Record<string, string> = {
  project: "project",
  space: "project",
  assignee: "assignee",
  reporter: "reporter",
  status: "status",
  priority: "priority",
  type: "type",
  issuetype: "type",
  worktype: "type",
  created: "created",
  createddate: "created",
  updated: "updated",
  updateddate: "updated",
  resolution: "resolution",
  due: "due",
  duedate: "due",
  startdate: "startdate",
  summary: "summary",
  description: "description",
  text: "text",
  parent: "parent",
  sprint: "sprint",
  workitemkey: "key",
  key: "key",
  id: "key",
  workitemlink: "workitemlink",
  attachments: "attachments",
};

export const NATIVE_FIELDS: Record<string, NativeFieldSpec> = {
  project: { name: "project", kind: "equality", sortable: false },
  assignee: { name: "assignee", kind: "equality", sortable: true },
  reporter: { name: "reporter", kind: "equality", sortable: true },
  status: { name: "status", kind: "equality", sortable: true },
  priority: { name: "priority", kind: "equality", sortable: true },
  type: { name: "type", kind: "equality", sortable: true },
  created: { name: "created", kind: "date", sortable: true },
  updated: { name: "updated", kind: "date", sortable: true },
  resolution: { name: "resolution", kind: "equality", sortable: false },
  due: { name: "due", kind: "date", sortable: true },
  startdate: { name: "startdate", kind: "date", sortable: true },
  summary: { name: "summary", kind: "text", sortable: false },
  description: { name: "description", kind: "text", sortable: false },
  text: { name: "text", kind: "textSearch", sortable: false },
  parent: { name: "parent", kind: "equality", sortable: false },
  sprint: { name: "sprint", kind: "equality", sortable: true },
  key: { name: "key", kind: "equality", sortable: true },
  workitemlink: { name: "workitemlink", kind: "link", sortable: false },
  attachments: { name: "attachments", kind: "attachment", sortable: false },
};

/** Fields recognized by the reference TQL grammar with no QuikTrack backing. */
export const UNSUPPORTED_FIELDS: Record<string, string> = {
  labels: 'no native "labels" column exists — if this project has a Labels-type custom field, use cf["Labels"] or cf[<fieldId>] instead',
  hierarchylevel: "QuikTrack has no leveled hierarchy scheme (no Advanced Roadmaps) — hierarchy is just parent/epic relations",
  resolved: "no resolution timestamp is stored (only a resolution reference) — resolution date isn't tracked",
  resolutiondate: "no resolution timestamp is stored (only a resolution reference) — resolution date isn't tracked",
  watcher: "QuikTrack has no watcher/subscription model",
  watchers: "QuikTrack has no watcher/subscription model",
  voter: "QuikTrack has no voting model",
  votes: "QuikTrack has no voting model",
  comment: "comments aren't indexed for search yet — use \"text\" for title/description/key, or search within an issue directly",
  worklogdate: "worklog isn't wired into issue-level search yet",
  worklogcomment: "worklog isn't wired into issue-level search yet",
  timespent: "worklog isn't wired into issue-level search yet",
  sla: "QuikTrack has no Service Management / SLA subsystem",
  approvals: "QuikTrack has no Service Management / approvals subsystem",
  organizations: "QuikTrack has no Service Management / organizations subsystem",
};
