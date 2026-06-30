/**
 * Single source of truth for mapping an ActivityFieldDefinition to the
 * LeadFieldDefinition shape that the shared lead/product machinery consumes
 * (validateDynamicFields on the server, DynamicFieldInput on the client).
 *
 * Pure + dependency-free (type-only imports) so BOTH the server write-service
 * and the client field-input wrapper import THIS one function. Do not copy it:
 * if the server and client mappings drifted, a field could render one way and
 * validate another.
 */
import type { LeadFieldDefinition } from "@/types/field-definition";
import type { ActivityFieldDefinition } from "@/types/activity-type";

export function toLeadDefShape(def: ActivityFieldDefinition): LeadFieldDefinition {
  return {
    key: def.key,
    label: def.label,
    fieldType: def.fieldType,
    requirement: def.requirement,
    visible: def.visible,
    options: def.options ?? undefined,
    // isStandard intentionally omitted/false — all activity fields are custom,
    // so none are filtered out by validateDynamicFields' standard-key guard.
  };
}
