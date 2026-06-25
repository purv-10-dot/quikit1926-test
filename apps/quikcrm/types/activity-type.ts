/**
 * Activity-type domain types (Phase 1 of the activity-logging feature).
 *
 * Admin-configurable activity TYPES, each with flat custom-field DEFINITIONS.
 * Backed by the CrmActivityType / CrmActivityFieldDefinition tables (real rows,
 * per-org) — NOT a JSON settings blob, and field VALUES live in the indexed
 * CrmActivityFieldValue table (Phase 2). See ACTIVITY-FEATURE-DECISIONS.md.
 *
 * The FieldType union is reused from the lead/product field system so the
 * shared FieldEditorModal can drive both. `showInList` is intentionally OMITTED
 * here (decision #8): it is a lead-list-column concept with no meaning for
 * activity fields. It may return in Phase 4 as a dashboard-column toggle.
 *
 * No `dependsOnKey` / cascading fields (decision #3): the only consumer was the
 * quarantined SMB flow.
 */
import type { FieldType } from "@/types/field-definition";

export type { FieldType };

/** Required vs Optional. Activity fields have no "System" tier (unlike standard lead fields). */
export type ActivityFieldRequirement = "Required" | "Optional";

/** One admin-defined custom field on an activity type. Mirrors a CrmActivityFieldDefinition row. */
export interface ActivityFieldDefinition {
  id: string;
  activityTypeId: string;
  /** Stable snake_case identifier, unique within its activity type. */
  key: string;
  label: string;
  fieldType: FieldType;
  requirement: ActivityFieldRequirement;
  /** Required for Select / MultiSelect; ignored otherwise. */
  options?: string[] | null;
  /** Whether the field renders in the log-activity form. Hidden ≠ deleted. */
  visible: boolean;
  helpText?: string | null;
  sortOrder: number;
}

/** An admin-defined activity type. Mirrors a CrmActivityType row. */
export interface ActivityTypeDefinition {
  id: string;
  code: string;
  label: string;
  category?: string | null;
  /** Open-ended per-type config bag (reserved for future per-type options). */
  config?: Record<string, unknown> | null;
  sortOrder: number;
  isActive: boolean;
}

/** An activity type together with its field definitions — the shape the
 *  logging UX (Phase 3) and the settings editor (Phase 1 UI) consume. */
export interface ActivityTypeWithFields extends ActivityTypeDefinition {
  fieldDefinitions: ActivityFieldDefinition[];
}
