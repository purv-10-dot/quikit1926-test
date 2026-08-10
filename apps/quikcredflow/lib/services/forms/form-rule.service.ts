/**
 * FR-RE Unit 4 (FR-RE-1 / FR-RE-2) — conditional rule + condition builder.
 *
 * Unit 4 is the MODEL + builder only: an admin defines rules (matchType all/any,
 * a flat list of conditions — NO nesting) on a DRAFT form-set version. It does
 * NOT evaluate rules (Unit 6) and does NOT define actions (Unit 5).
 *
 * Field-reference policy — VALIDATE-AT-BUILD for structural references:
 *   A condition with subjectKind=field must reference a field that actually
 *   exists in the same version; a dangling reference is rejected at save time
 *   (matches the existing validateRuleAction convention and Unit 5's set_stage
 *   target check). valueKeys are comparison LITERALS and stay lenient — a stale
 *   match value simply fails to match at eval (Unit 6), it is not a structural
 *   error here.
 *
 * Mutations target a DRAFT version (shared assertDraft from form-structure.service;
 * Unit 7 upgrades that single guard to clone-on-edit).
 */
import { prisma } from "@/lib/db/prisma";
import { assertDraft } from "@/lib/services/forms/form-structure.service";
import { Prisma } from "@quikit/database";
import type {
  QcfFormRule,
  QcfFormRuleCondition,
  QcfFormRuleMatchType,
  QcfFormRuleSubjectKind,
  QcfFormRuleOperator,
} from "@quikit/database";

export class FormRuleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FormRuleError";
    this.statusCode = statusCode;
  }
}

export interface ConditionInput {
  subjectKind: QcfFormRuleSubjectKind;
  subjectFieldKey?: string | null;
  operator: QcfFormRuleOperator;
  valueKeys?: string[] | null;
}

const SINGLE_VALUE_OPS: QcfFormRuleOperator[] = ["is", "is_not"];
const MULTI_VALUE_OPS: QcfFormRuleOperator[] = ["is_any_of", "is_none_of"];
const NO_VALUE_OPS: QcfFormRuleOperator[] = ["is_empty", "is_not_empty"];

/**
 * Pure SHAPE validation (no DB): subject-kind <-> subjectFieldKey coupling and
 * operator <-> valueKeys arity. Structural existence (does the field exist?) is
 * checked separately in addRuleCondition/updateRuleCondition.
 */
export function validateConditionInput(input: ConditionInput): void {
  const { subjectKind, subjectFieldKey, operator } = input;
  const values = input.valueKeys ?? [];

  // Subject coupling.
  if (subjectKind === "field") {
    if (!subjectFieldKey || !subjectFieldKey.trim()) {
      throw new FormRuleError("A field condition requires a subjectFieldKey.", 422);
    }
  } else if (subjectFieldKey != null && subjectFieldKey !== "") {
    throw new FormRuleError(
      `A ${subjectKind} condition must not carry a subjectFieldKey.`,
      422,
    );
  }

  // Value entries must be non-empty strings.
  if (values.some((v) => typeof v !== "string" || v.trim() === "")) {
    throw new FormRuleError("valueKeys entries must be non-empty strings.", 422);
  }

  // Operator <-> arity.
  if (SINGLE_VALUE_OPS.includes(operator) && values.length !== 1) {
    throw new FormRuleError(`Operator "${operator}" requires exactly one value.`, 422);
  }
  if (MULTI_VALUE_OPS.includes(operator) && values.length < 1) {
    throw new FormRuleError(`Operator "${operator}" requires at least one value.`, 422);
  }
  if (NO_VALUE_OPS.includes(operator) && values.length !== 0) {
    throw new FormRuleError(`Operator "${operator}" must not carry any values.`, 422);
  }
}

/** Validate-at-build: a field-subject condition must reference an existing field. */
export async function assertFieldExists(formSetVersionId: string, fieldKey: string): Promise<void> {
  const field = await prisma.qcfFormField.findFirst({
    where: { formSetVersionId, fieldKey },
    select: { id: true },
  });
  if (!field) {
    throw new FormRuleError(
      `Condition references field "${fieldKey}" which does not exist in this version.`,
      422,
    );
  }
}

/** All rules of a version with their conditions, ordered. */
export async function getFormRules(formSetVersionId: string) {
  return prisma.qcfFormRule.findMany({
    where: { formSetVersionId },
    orderBy: { sortOrder: "asc" },
    include: {
      conditions: { orderBy: { sortOrder: "asc" } },
      // Actions included so the builder can pre-populate the THEN side on edit (2-B).
      actions: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function createFormRule(input: {
  formSetVersionId: string;
  name: string;
  matchType: QcfFormRuleMatchType;
  sortOrder: number;
  isActive?: boolean;
  createdByUserId?: string | null;
}): Promise<QcfFormRule> {
  await assertDraft(input.formSetVersionId);
  return prisma.qcfFormRule.create({
    data: {
      formSetVersionId: input.formSetVersionId,
      name: input.name,
      matchType: input.matchType,
      sortOrder: input.sortOrder,
      isActive: input.isActive ?? true,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

/** Resolve a rule's version (and assert it is a draft) for any rule-scoped edit. */
export async function assertRuleDraft(formRuleId: string): Promise<string> {
  const rule = await prisma.qcfFormRule.findUnique({
    where: { id: formRuleId },
    select: { formSetVersionId: true },
  });
  if (!rule) throw new FormRuleError("Rule not found.", 404);
  await assertDraft(rule.formSetVersionId);
  return rule.formSetVersionId;
}

export async function updateFormRule(input: {
  ruleId: string;
  name?: string;
  matchType?: QcfFormRuleMatchType;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<QcfFormRule> {
  await assertRuleDraft(input.ruleId);
  return prisma.qcfFormRule.update({
    where: { id: input.ruleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteFormRule(ruleId: string): Promise<void> {
  await assertRuleDraft(ruleId);
  await prisma.qcfFormRule.delete({ where: { id: ruleId } }); // conditions/actions cascade
}

export async function addRuleCondition(input: {
  formRuleId: string;
  subjectKind: QcfFormRuleSubjectKind;
  subjectFieldKey?: string | null;
  operator: QcfFormRuleOperator;
  valueKeys?: string[] | null;
  sortOrder: number;
}): Promise<QcfFormRuleCondition> {
  validateConditionInput(input);
  const versionId = await assertRuleDraft(input.formRuleId);
  if (input.subjectKind === "field") {
    await assertFieldExists(versionId, input.subjectFieldKey!.trim());
  }
  return prisma.qcfFormRuleCondition.create({
    data: {
      formRuleId: input.formRuleId,
      subjectKind: input.subjectKind,
      subjectFieldKey: input.subjectKind === "field" ? input.subjectFieldKey!.trim() : null,
      operator: input.operator,
      valueKeys: toValueKeysJson(input.valueKeys),
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateRuleCondition(input: {
  conditionId: string;
  subjectKind?: QcfFormRuleSubjectKind;
  subjectFieldKey?: string | null;
  operator?: QcfFormRuleOperator;
  valueKeys?: string[] | null;
  sortOrder?: number;
}): Promise<QcfFormRuleCondition> {
  const existing = await prisma.qcfFormRuleCondition.findUnique({
    where: { id: input.conditionId },
    select: {
      formRuleId: true,
      subjectKind: true,
      subjectFieldKey: true,
      operator: true,
      valueKeys: true,
    },
  });
  if (!existing) throw new FormRuleError("Condition not found.", 404);
  const versionId = await assertRuleDraft(existing.formRuleId);

  // Validate the MERGED state, not the patch in isolation.
  const merged: ConditionInput = {
    subjectKind: input.subjectKind ?? existing.subjectKind,
    subjectFieldKey:
      input.subjectFieldKey !== undefined ? input.subjectFieldKey : existing.subjectFieldKey,
    operator: input.operator ?? existing.operator,
    valueKeys:
      input.valueKeys !== undefined ? input.valueKeys : fromValueKeysJson(existing.valueKeys),
  };
  validateConditionInput(merged);
  if (merged.subjectKind === "field") {
    await assertFieldExists(versionId, merged.subjectFieldKey!.trim());
  }

  return prisma.qcfFormRuleCondition.update({
    where: { id: input.conditionId },
    data: {
      subjectKind: merged.subjectKind,
      subjectFieldKey:
        merged.subjectKind === "field" ? merged.subjectFieldKey!.trim() : null,
      operator: merged.operator,
      valueKeys: toValueKeysJson(merged.valueKeys),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteRuleCondition(conditionId: string): Promise<void> {
  const existing = await prisma.qcfFormRuleCondition.findUnique({
    where: { id: conditionId },
    select: { formRuleId: true },
  });
  if (!existing) throw new FormRuleError("Condition not found.", 404);
  await assertRuleDraft(existing.formRuleId);
  await prisma.qcfFormRuleCondition.delete({ where: { id: conditionId } });
}

/** Store valueKeys as a uniform JSON string[]; no values -> SQL NULL. */
function toValueKeysJson(
  values?: string[] | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  const arr = (values ?? []).map((v) => v.trim());
  return arr.length ? arr : Prisma.DbNull;
}

/** Read a stored valueKeys JSON back into a string[] for merge/validation. */
function fromValueKeysJson(json: Prisma.JsonValue | null): string[] {
  return Array.isArray(json) ? json.map((v) => String(v)) : [];
}
