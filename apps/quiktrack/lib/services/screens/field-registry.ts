/**
 * The fields a Screen can arrange — QuikTrack's real work-item fields only (not
 * Jira's full catalog). Single source of truth for the Configure-Screen "Select
 * Field" list and for validating a screen's stored fieldKeys. Keys are stable
 * identifiers persisted in QtScreenField.fieldKey.
 */
export interface ScreenFieldMeta {
  key: string;
  label: string;
}

export const SCREEN_FIELDS: ScreenFieldMeta[] = [
  { key: "summary", label: "Summary" },
  { key: "type", label: "Work item type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "reporter", label: "Reporter" },
  { key: "resolution", label: "Resolution" },
  { key: "description", label: "Description" },
  { key: "startDate", label: "Start date" },
  { key: "dueDate", label: "Due date" },
  { key: "storyPoints", label: "Story points" },
  { key: "eta", label: "ETA" },
];

const BY_KEY = new Map(SCREEN_FIELDS.map((f) => [f.key, f] as const));

/** Custom-field keys are namespaced so they can never collide with a built-in. */
export const CUSTOM_FIELD_PREFIX = "cf:";
export function isCustomFieldKey(key: string): boolean {
  return key.startsWith(CUSTOM_FIELD_PREFIX);
}
export function customFieldKey(cfKey: string): string {
  return `${CUSTOM_FIELD_PREFIX}${cfKey}`;
}

/** True for a built-in OR a namespaced custom-field key (real fields we persist). */
export function isScreenField(key: string): boolean {
  return BY_KEY.has(key) || isCustomFieldKey(key);
}

export function screenFieldLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** The system field set the seeded "Default Screen" ships with (in order). */
export const DEFAULT_SCREEN_FIELD_KEYS: string[] = SCREEN_FIELDS.map((f) => f.key);
