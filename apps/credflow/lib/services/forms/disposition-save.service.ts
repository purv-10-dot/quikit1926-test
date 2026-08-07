/**
 * FR-RE save-wiring — connect the rule engine to the disposition save.
 *
 * Fully synchronous (no Redis/queue). Two responsibilities:
 *   - saveDispositionFieldValues: persist the custom field values the agent
 *     entered, keyed to (activityId, form_set_version), typed server-side by the
 *     field definition (the client is not trusted for value type).
 *   - saveAndApplyDisposition: resolve the live form version, write the field
 *     values, then run applyFormRules (Unit 6b) and return the decision.
 *
 * Ordering at the call site is Option A (see docs/fr-re-followups.md): FR-RE runs
 * LAST and overrides the lead status ONLY when a rule fired. This service is the
 * FR-RE step; createCallLog invokes it after FR-D3 + the built-in mapping.
 */
import { prisma } from "@/lib/db/prisma";
import { applyFormRules, type ApplyResult } from "@/lib/services/forms/form-rule-apply.service";

export type DispositionFieldValue = string | string[] | number | null;

/** The live (currently published) call_disposition form version for a tenant, or null. */
export async function getLiveDispositionVersionId(orgId: string): Promise<string | null> {
  const set = await prisma.qcfFormSet.findFirst({
    where: { orgId, surface: "call_disposition", isDefault: true },
    select: { currentVersionId: true },
  });
  return set?.currentVersionId ?? null;
}

/**
 * Persist the agent-entered custom field values. The field's type is resolved
 * from the version (server-authoritative): values for fields not defined in the
 * version are ignored, and file_upload fields are skipped (Unit 3b's upload flow
 * owns valueFileId, keyed to the same activity).
 */
export async function saveDispositionFieldValues(input: {
  orgId: string;
  activityId: string;
  formSetVersionId: string;
  fieldValues: Record<string, DispositionFieldValue>;
}): Promise<void> {
  const keys = Object.keys(input.fieldValues);
  if (keys.length === 0) return;

  const defs = await prisma.qcfFormField.findMany({
    where: { formSetVersionId: input.formSetVersionId, fieldKey: { in: keys } },
    select: { fieldKey: true, fieldType: true },
  });
  const typeByKey = new Map(defs.map((d) => [d.fieldKey, d.fieldType]));

  for (const fieldKey of keys) {
    const fieldType = typeByKey.get(fieldKey);
    if (!fieldType || fieldType === "file_upload") continue; // unknown -> ignore; file -> owned by upload flow

    const raw = input.fieldValues[fieldKey];
    const data: {
      valueType: typeof fieldType;
      valueText?: string | null;
      valueNumber?: number | null;
      valueDatetime?: Date | null;
      valueUserIds?: string[];
    } = { valueType: fieldType };

    switch (fieldType) {
      case "user_picker":
        data.valueUserIds = Array.isArray(raw) ? raw.map((v) => String(v)) : raw == null ? [] : [String(raw)];
        break;
      case "number":
        data.valueNumber = raw == null || raw === "" ? null : Number(raw);
        break;
      case "datetime":
        data.valueDatetime = raw == null || raw === "" ? null : new Date(String(raw));
        break;
      default: // text, dropdown
        data.valueText = raw == null ? null : String(raw);
    }

    await prisma.qcfFieldValue.upsert({
      where: { activityId_fieldKey: { activityId: input.activityId, fieldKey } },
      create: {
        orgId: input.orgId,
        activityId: input.activityId,
        formSetVersionId: input.formSetVersionId,
        fieldKey,
        ...data,
      },
      update: data,
    });
  }
}

export interface DispositionSaveResult extends ApplyResult {
  versionId: string;
}

/**
 * The FR-RE disposition step: resolve the live version, persist the entered
 * field values, then evaluate + apply the rules. Returns null when the tenant
 * has no live form set (legacy-only path — caller keeps today's behaviour).
 */
export async function saveAndApplyDisposition(input: {
  orgId: string;
  leadId: string;
  activityId: string;
  fieldValues: Record<string, DispositionFieldValue>;
}): Promise<DispositionSaveResult | null> {
  const versionId = await getLiveDispositionVersionId(input.orgId);
  if (!versionId) return null;

  await saveDispositionFieldValues({
    orgId: input.orgId,
    activityId: input.activityId,
    formSetVersionId: versionId,
    fieldValues: input.fieldValues,
  });

  const applied = await applyFormRules({
    orgId: input.orgId,
    leadId: input.leadId,
    activityId: input.activityId,
    formSetVersionId: versionId,
  });

  return { ...applied, versionId };
}
