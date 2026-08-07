/**
 * FR-RE Slice 0 — form-set creation + the agent RUNTIME shape, real DB.
 *
 *   createFormSet    — create a set + its first draft version + the protected
 *                      Call Disposition tab (and its 4 protected fields).
 *   listFormSets     — resolve a tenant's call_disposition sets.
 *   getFormRuntime   — the payload the agent client consumes: the full structure
 *                      (tabs -> sections, fields -> options) AND the rules in the
 *                      pure EvalRule shape (matchType, conditions, actions). If
 *                      this shape is wrong the agent UI gets bad data, so it is
 *                      asserted explicitly.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormSet, listFormSets } from "@/lib/services/forms/form-set.service";
import { createFormField } from "@/lib/services/forms/form-structure.service";
import { createFormRule, addRuleCondition } from "@/lib/services/forms/form-rule.service";
import { addRuleAction } from "@/lib/services/forms/form-rule-action.service";
import { getFormRuntime } from "@/lib/services/forms/form-runtime.service";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

const STAMP = Date.now();
const TENANT = `int_frre_s0set_${STAMP}`;
const OTHER_TENANT = `int_frre_s0other_${STAMP}`;

let setId: string;
let versionId: string;

afterAll(async () => {
  const versions = await db.qcfFormSetVersion.findMany({ where: { formSetId: setId }, select: { id: true } });
  const vids = versions.map((v) => v.id);
  const fields = await db.qcfFormField.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  const rules = await db.qcfFormRule.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  const tabs = await db.qcfFormTab.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  if (rules.length) {
    await db.qcfFormRuleAction.deleteMany({ where: { formRuleId: { in: rules.map((r) => r.id) } } });
    await db.qcfFormRuleCondition.deleteMany({ where: { formRuleId: { in: rules.map((r) => r.id) } } });
    await db.qcfFormRule.deleteMany({ where: { id: { in: rules.map((r) => r.id) } } });
  }
  if (fields.length) await db.qcfFormFieldOption.deleteMany({ where: { formFieldId: { in: fields.map((f) => f.id) } } });
  await db.qcfFormField.deleteMany({ where: { formSetVersionId: { in: vids } } });
  if (tabs.length) await db.qcfFormSection.deleteMany({ where: { formTabId: { in: tabs.map((t) => t.id) } } });
  await db.qcfFormTab.deleteMany({ where: { formSetVersionId: { in: vids } } });
  await db.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qcfFormSet.deleteMany({ where: { id: setId } });
});

describe("createFormSet + listFormSets", () => {
  it("creates a default call_disposition set, a v1 draft, and seeds the protected tab + 4 fields", async () => {
    const { set, version } = await createFormSet({ tenantId: TENANT, name: `CredFlow ${STAMP}` });
    setId = set.id;
    versionId = version.id;

    expect(set.surface).toBe("call_disposition");
    expect(set.isDefault).toBe(true);
    expect(version.versionNumber).toBe(1);
    expect(version.status).toBe("draft");

    const tabs = await db.qcfFormTab.findMany({ where: { formSetVersionId: versionId } });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.isProtected).toBe(true);
    const protectedFields = await db.qcfFormField.count({ where: { formSetVersionId: versionId, isProtected: true } });
    expect(protectedFields).toBe(4); // contact_stage, status, sub_stage, notes
  });

  it("listFormSets resolves the tenant's set", async () => {
    const sets = await listFormSets(TENANT);
    expect(sets.map((s) => s.id)).toContain(setId);
  });
});

describe("getFormRuntime — the agent client payload shape", () => {
  it("returns the full structure (fields + options) AND rules in EvalRule shape", async () => {
    // Custom fields: a dropdown (with options) + a text field a rule will reveal.
    await createFormField({
      formSetVersionId: versionId,
      fieldKey: "payment_mode",
      label: "Payment Mode",
      fieldType: "dropdown",
      sortOrder: 10,
      options: [
        { valueKey: "upi", label: "UPI" },
        { valueKey: "invoice", label: "Invoice" },
      ],
    });
    await createFormField({
      formSetVersionId: versionId,
      fieldKey: "invoice_num",
      label: "Invoice #",
      fieldType: "text",
      sortOrder: 11,
    });

    const rule = await createFormRule({ formSetVersionId: versionId, name: "reveal invoice #", matchType: "all", sortOrder: 0 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "field", subjectFieldKey: "payment_mode", operator: "is", valueKeys: ["invoice"], sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "show_field", targetKind: "field", targetFieldKey: "invoice_num", sortOrder: 0 });

    const runtime = await getFormRuntime(versionId, TENANT);

    // structure: the flat fields list carries every field (placed or not) + options
    const paymentField = runtime.fields.find((f) => f.fieldKey === "payment_mode");
    expect(paymentField).toBeDefined();
    expect(paymentField!.options.map((o) => o.valueKey).sort()).toEqual(["invoice", "upi"]);

    // rules: pure EvalRule shape (ready to hand straight to evaluateFormRules)
    expect(runtime.rules).toHaveLength(1);
    const r = runtime.rules[0]!;
    expect(r).toMatchObject({ matchType: "all", isActive: true });
    expect(r.conditions[0]).toMatchObject({ subjectKind: "field", subjectFieldKey: "payment_mode", operator: "is" });
    expect(r.conditions[0]!.valueKeys).toEqual(["invoice"]);
    expect(r.actions[0]).toMatchObject({ actionType: "show_field", targetFieldKey: "invoice_num" });
  });

  it("SECURITY: rejects a cross-tenant runtime read (404, not the data)", async () => {
    // The runtime route has no settings gate; tenant-scope IS its security. A
    // user from another tenant must NOT read this tenant's form (AC-RE-17 style).
    await expect(getFormRuntime(versionId, OTHER_TENANT)).rejects.toBeInstanceOf(FormStructureError);
  });
});
