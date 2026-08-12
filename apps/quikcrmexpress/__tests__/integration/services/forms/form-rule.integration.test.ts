/**
 * FR-RE Unit 4 (FR-RE-1 / FR-RE-2) — rule + condition builder, real DB.
 *
 * Proves the condition model round-trips correctly (the data Units 5/6 build on):
 *   - A version-scoped rule with matchType all/any (flat, NO nesting).
 *   - Conditions over field / status subjects, with operator + valueKeys stored
 *     and read back intact (is single value; is_any_of array).
 *   - The draft-only mutation guard (mutating a published version is rejected).
 *   - Deleting a rule cascades its conditions.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import {
  createFormRule,
  addRuleCondition,
  deleteFormRule,
  getFormRules,
  FormRuleError,
} from "@/lib/services/forms/form-rule.service";

const STAMP = Date.now();
const TENANT = `int_frre_u4_${STAMP}`;
let setId: string;
let versionId: string;

beforeAll(async () => {
  const set = await integrationPrisma.qceFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}` },
  });
  setId = set.id;
  const version = await integrationPrisma.qceFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  });
  versionId = version.id;

  // Validate-at-build: field-subject conditions reference real fields, so seed
  // the fields the conditions below point at (payment_mode, f).
  await integrationPrisma.qceFormField.createMany({
    data: [
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "payment_mode", label: "Payment Mode", fieldType: "dropdown", sortOrder: 0 },
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "f", label: "F", fieldType: "text", sortOrder: 1 },
    ],
  });
});

afterAll(async () => {
  // Conditions cascade on rule delete; clean any stragglers in FK order.
  const rules = await integrationPrisma.qceFormRule.findMany({
    where: { formSetVersionId: versionId },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length) {
    await integrationPrisma.qceFormRuleCondition.deleteMany({ where: { formRuleId: { in: ruleIds } } });
    await integrationPrisma.qceFormRule.deleteMany({ where: { id: { in: ruleIds } } });
  }
  await integrationPrisma.qceFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await integrationPrisma.qceFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await integrationPrisma.qceFormSet.deleteMany({ where: { id: setId } });
});

describe("form-rule builder (FR-RE-1/2)", () => {
  it("stores a matchType=all rule with field + status conditions, read back intact", async () => {
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: "Show GST fields when paying by invoice",
      matchType: "all",
      sortOrder: 0,
    });
    expect(rule.matchType).toBe("all");

    await addRuleCondition({
      formRuleId: rule.id,
      subjectKind: "field",
      subjectFieldKey: "payment_mode",
      operator: "is",
      valueKeys: ["invoice"],
      sortOrder: 0,
    });
    await addRuleCondition({
      formRuleId: rule.id,
      subjectKind: "status",
      operator: "is_any_of",
      valueKeys: ["qualified", "negotiation"],
      sortOrder: 1,
    });

    const rules = await getFormRules(versionId);
    const stored = rules.find((r) => r.id === rule.id);
    expect(stored).toBeDefined();
    expect(stored!.conditions).toHaveLength(2);

    const [c0, c1] = stored!.conditions;
    expect(c0).toMatchObject({
      subjectKind: "field",
      subjectFieldKey: "payment_mode",
      operator: "is",
    });
    expect(c0!.valueKeys).toEqual(["invoice"]);
    expect(c1).toMatchObject({ subjectKind: "status", operator: "is_any_of", subjectFieldKey: null });
    expect(c1!.valueKeys).toEqual(["qualified", "negotiation"]);
  });

  it("validate-at-build: rejects a field condition referencing a nonexistent field", async () => {
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: "dangling-ref",
      matchType: "all",
      sortOrder: 5,
    });
    await expect(
      addRuleCondition({
        formRuleId: rule.id,
        subjectKind: "field",
        subjectFieldKey: "does_not_exist",
        operator: "is",
        valueKeys: ["x"],
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(FormRuleError);
  });

  it("supports matchType=any (flat OR — no nesting)", async () => {
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: "any-match rule",
      matchType: "any",
      sortOrder: 1,
    });
    expect(rule.matchType).toBe("any");
  });

  it("rejects mutating a PUBLISHED version (draft-only guard)", async () => {
    const set = await integrationPrisma.qceFormSet.create({
      data: { orgId: TENANT, surface: "call_disposition", name: `Pub ${STAMP}` },
    });
    const published = await integrationPrisma.qceFormSetVersion.create({
      data: { formSetId: set.id, versionNumber: 1, status: "published" },
    });

    // Draft guard is the shared assertDraft (FormStructureError, 409).
    await expect(
      createFormRule({ formSetVersionId: published.id, name: "nope", matchType: "all", sortOrder: 0 }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await integrationPrisma.qceFormSetVersion.deleteMany({ where: { formSetId: set.id } });
    await integrationPrisma.qceFormSet.deleteMany({ where: { id: set.id } });
  });

  it("deleting a rule cascades its conditions", async () => {
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: "to-delete",
      matchType: "all",
      sortOrder: 2,
    });
    await addRuleCondition({
      formRuleId: rule.id,
      subjectKind: "field",
      subjectFieldKey: "f",
      operator: "is_empty",
      sortOrder: 0,
    });

    await deleteFormRule(rule.id);

    const remaining = await integrationPrisma.qceFormRuleCondition.count({
      where: { formRuleId: rule.id },
    });
    expect(remaining).toBe(0);
  });
});
