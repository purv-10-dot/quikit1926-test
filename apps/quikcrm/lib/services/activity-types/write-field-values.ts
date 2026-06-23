/**
 * Write activity custom-field VALUES into the indexed CrmActivityFieldValue
 * table (decision #1 — typed columns, queryable). Runs INSIDE the activity-
 * create transaction (takes a `tx`) so the activity row and its value rows
 * commit/roll back atomically.
 *
 * Validation + coercion + unknown-key-drop + required-field errors are reused
 * wholesale from the lead path's validateDynamicFields (one source of truth for
 * "how a custom-field value is validated"). This service adds only the
 * activity-specific part: routing each coerced value into the right typed
 * column, including re-hydrating Date (validateDynamicFields coerces Date to an
 * ISO string; valueDate is a real timestamp column, so we parse it back).
 *
 * Phone is UNSUPPORTED for activity fields in v1 (no use case; the lead phone-
 * object shape would couple storage and isn't queryable by the per-value
 * indexes). The service throws if a definition is Phone-typed.
 * See ACTIVITY-FEATURE-DECISIONS.md.
 */
import type { Prisma, PrismaClient } from "@quikit/database";
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import type { LeadFieldDefinition } from "@/types/field-definition";
import type { ActivityFieldDefinition } from "@/types/activity-type";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Thrown when submitted activity field values fail validation (missing
 * required, bad coercion, unsupported Phone type). Carries statusCode 400 so
 * the route's errorResponse maps it to a 400 — distinct from an unexpected
 * server error (no statusCode) which surfaces as 500. Callers that catch this
 * specifically can map it to a client error without swallowing real failures.
 */
export class ActivityFieldValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ActivityFieldValidationError";
  }
}

export interface WriteActivityFieldValuesInput {
  orgId: string;
  activityId: string;
  activityTypeId: string;
  values: Record<string, unknown> | null | undefined;
}

/** Map an activity field definition to the LeadFieldDefinition shape that
 *  validateDynamicFields consumes. They share the FieldType union; the lead
 *  validator only reads key/label/fieldType/requirement/options. */
function toLeadDefShape(def: ActivityFieldDefinition): LeadFieldDefinition {
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

/** Route a coerced value into the correct typed column. Non-target columns
 *  stay undefined (→ NULL). Re-hydrates Date from validateDynamicFields' ISO. */
function routeToColumn(
  def: ActivityFieldDefinition,
  coerced: unknown,
): Pick<
  Prisma.CrmActivityFieldValueUncheckedCreateInput,
  "valueText" | "valueNumber" | "valueDate" | "valueBoolean" | "valueJson"
> {
  switch (def.fieldType) {
    case "Text":
    case "TextArea":
    case "Email":
    case "Select":
      // Assumption: validateDynamicFields already coerced these to a trimmed
      // string, so String() is belt-and-suspenders. It never throws — if an
      // unexpected non-string ever reached here it would store garbage
      // (String(null)→"null") rather than error. Safe given the validator
      // contract; revisit if the validator's text coercion ever changes.
      return { valueText: String(coerced) };
    case "Number":
      return { valueNumber: coerced as number };
    case "Boolean":
      return { valueBoolean: coerced as boolean };
    case "Date":
      // validateDynamicFields returns an ISO string; valueDate is a timestamp.
      return { valueDate: new Date(coerced as string) };
    case "MultiSelect":
      return { valueJson: coerced as Prisma.InputJsonValue };
    case "Phone":
      // Unreachable — Phone is rejected upfront. Guard for exhaustiveness.
      throw new Error(`Phone is an unsupported activity field type`);
    default:
      throw new Error(`Unsupported activity field type: ${String(def.fieldType)}`);
  }
}

export async function writeActivityFieldValues(
  tx: Tx,
  input: WriteActivityFieldValuesInput,
): Promise<void> {
  const type = await getActivityTypeWithFields(input.orgId, input.activityTypeId);
  const defs = type?.fieldDefinitions ?? [];

  // Phone is unsupported in v1 — reject before any write so the failure is
  // explicit, not a silent mis-store.
  const phone = defs.find((d) => d.fieldType === "Phone");
  if (phone) {
    throw new ActivityFieldValidationError(
      `Activity field "${phone.label}" uses the unsupported Phone type`,
    );
  }

  // Reuse the lead validator: coerces known keys, drops unknown keys, and
  // records required-field misses in `errors` (it does NOT throw).
  const { values, errors } = validateDynamicFields({
    defs: defs.map(toLeadDefShape),
    input: input.values,
    requireMissing: true,
  });

  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    const detail = errorKeys.map((k) => errors[k]).join("; ");
    throw new ActivityFieldValidationError(`Activity field validation failed: ${detail}`);
  }

  // One row per provided (non-empty) field. `values` is keyed by field key and
  // contains only coerced, present values.
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, coerced] of Object.entries(values)) {
    const def = byKey.get(key);
    if (!def) continue; // defensive — validator only emits known keys
    await tx.crmActivityFieldValue.create({
      data: {
        orgId: input.orgId,
        activityId: input.activityId,
        fieldDefinitionId: def.id,
        fieldKey: def.key,
        ...routeToColumn(def, coerced),
      },
    });
  }
}
