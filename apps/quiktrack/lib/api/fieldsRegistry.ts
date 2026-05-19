/**
 * Form-field catalog for the QuikTrack field-level RBAC system.
 *
 * Each entity below corresponds to a real form in the app (Issue create /
 * edit, Project create / edit, Sprint, Timesheet, Comment). For every
 * field the role-management matrix lets an admin pick one of four levels
 * that drive how the field is rendered + whether mutations are accepted:
 *
 *   hidden    — field not rendered, mutation rejected
 *   readonly  — field rendered disabled, mutation rejected
 *   editable  — field rendered editable, mutation accepted (DEFAULT)
 *   required  — field rendered editable + marked required; empty rejects
 *
 * Absence of a row in QtRoleFieldPermission means `editable` so admins can
 * adopt this incrementally without breaking existing roles.
 */

export const FIELD_LEVELS = ["hidden", "readonly", "editable", "required"] as const;
export type FieldLevel = (typeof FIELD_LEVELS)[number];

export const DEFAULT_FIELD_LEVEL: FieldLevel = "editable";

export interface FieldDef {
  /** Stable storage key — what we write to QtRoleFieldPermission.field. */
  key: string;
  /** Human label shown in the matrix. */
  label: string;
  /**
   * System-required fields can't be set below `editable` (you can mark them
   * `required` but you can't `hide` them — the form would break).
   */
  systemRequired?: boolean;
  /** Optional sub-label / hint shown in the matrix. */
  hint?: string;
}

export interface EntityDef {
  /** Stable storage key — what we write to QtRoleFieldPermission.entity. */
  key: string;
  /** Human label shown in the matrix. */
  label: string;
  /** Brief explanation of which form this entity drives. */
  description: string;
  fields: FieldDef[];
}

export const FIELD_TREE: EntityDef[] = [
  {
    key: "Issue",
    label: "Issue",
    description: "Fields on the create-issue modal and the issue detail panel.",
    fields: [
      { key: "title", label: "Title", systemRequired: true },
      { key: "description", label: "Description" },
      { key: "type", label: "Issue type", systemRequired: true },
      { key: "status", label: "Status", systemRequired: true },
      { key: "priority", label: "Priority" },
      { key: "assignee", label: "Assignee" },
      { key: "reporter", label: "Reporter" },
      { key: "labels", label: "Labels" },
      { key: "dueDate", label: "Due date" },
      { key: "startDate", label: "Start date" },
      { key: "storyPoints", label: "Story points" },
      { key: "originalEstimate", label: "Original estimate" },
      { key: "parent", label: "Parent issue" },
      { key: "sprint", label: "Sprint" },
      { key: "attachments", label: "Attachments" },
      { key: "watchers", label: "Watchers" },
    ],
  },
  {
    key: "Project",
    label: "Project (Space)",
    description: "Fields on the create-space form and the space settings panel.",
    fields: [
      { key: "name", label: "Name", systemRequired: true },
      { key: "key", label: "Key", systemRequired: true, hint: "Short code (e.g. QT)" },
      { key: "description", label: "Description" },
      { key: "icon", label: "Icon" },
      { key: "color", label: "Color" },
      { key: "lead", label: "Project lead" },
      { key: "projectType", label: "Project type" },
      { key: "accessLevel", label: "Access level" },
    ],
  },
  {
    key: "Sprint",
    label: "Sprint",
    description: "Fields on the create-sprint and sprint-settings forms.",
    fields: [
      { key: "name", label: "Name", systemRequired: true },
      { key: "goal", label: "Goal" },
      { key: "startDate", label: "Start date" },
      { key: "endDate", label: "End date" },
    ],
  },
  {
    key: "Timesheet",
    label: "Timesheet entry",
    description: "Fields on the time-entry log row.",
    fields: [
      { key: "project", label: "Project", systemRequired: true },
      { key: "issue", label: "Issue" },
      { key: "date", label: "Date", systemRequired: true },
      { key: "hours", label: "Hours", systemRequired: true },
      { key: "description", label: "Description" },
      { key: "billable", label: "Billable" },
    ],
  },
  {
    key: "IssueComment",
    label: "Issue comment",
    description: "Fields on the issue comment composer.",
    fields: [
      { key: "body", label: "Body", systemRequired: true },
      { key: "internalOnly", label: "Internal only" },
    ],
  },
];

/* ───────────────────────── Derived helpers ───────────────────────── */

export function isFieldLevel(s: string): s is FieldLevel {
  return (FIELD_LEVELS as readonly string[]).includes(s);
}

/** All entity keys declared in the catalog. */
export const ALL_ENTITIES: readonly string[] = FIELD_TREE.map((e) => e.key);

/** Map of entity → set of valid field keys, for validation. */
const _fieldKeysByEntity = new Map<string, Set<string>>();
for (const e of FIELD_TREE) {
  _fieldKeysByEntity.set(e.key, new Set(e.fields.map((f) => f.key)));
}

/** True when (entity, field) appears in the catalog. */
export function isCatalogField(entity: string, field: string): boolean {
  return _fieldKeysByEntity.get(entity)?.has(field) ?? false;
}

/** Look up the FieldDef (for systemRequired / label) given keys. */
export function findField(entity: string, field: string): FieldDef | null {
  const ent = FIELD_TREE.find((e) => e.key === entity);
  return ent?.fields.find((f) => f.key === field) ?? null;
}
