/**
 * FR-RE Unit 7 — versioning / clone-on-edit, real DB.
 *
 * Clone-on-edit: editing a PUBLISHED version must not block — instead a full,
 * independent DRAFT clone is made and edited; the published version stays frozen
 * and any records logged against it stay pinned (we never clone field VALUES).
 *
 * THE CENTERPIECE is deep-copy COMPLETENESS: a version owns tabs -> sections,
 * fields -> options, and rules -> conditions + actions. A shallow clone that
 * dropped rules/conditions/actions/options would silently lose form logic. This
 * suite proves every level is copied AND that intra-version references are
 * remapped to the clone (an action's targetTabId must point at the NEW tab, not
 * the source's).
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormTab, createFormSection, assertDraft, FormStructureError } from "@/lib/services/forms/form-structure.service";
import { createFormRule, addRuleCondition } from "@/lib/services/forms/form-rule.service";
import { addRuleAction } from "@/lib/services/forms/form-rule-action.service";
import { cloneVersionToDraft, publishVersion } from "@/lib/services/forms/form-version.service";

const STAMP = Date.now();
const TENANT = `int_frre_u7_${STAMP}`;

let setId: string;
let v1: string; // the source version (gets published)
let srcTabId: string;
let srcFieldId: string;

beforeAll(async () => {
  const set = await db.qcfFormSet.create({ data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}` } });
  setId = set.id;
  const version = await db.qcfFormSetVersion.create({ data: { formSetId: setId, versionNumber: 1, status: "draft" } });
  v1 = version.id;

  // Build a full structure on the draft: tab -> section, field (+options),
  // rule -> condition + action (show_tab referencing the tab — so targetTabId
  // remapping is exercised by the clone).
  const tab = await createFormTab({ formSetVersionId: v1, name: "Payment", visibility: "rule_driven", sortOrder: 0 });
  srcTabId = tab.id;
  const section = await createFormSection({ formTabId: srcTabId, name: "Bank", sortOrder: 0 });

  const field = await db.qcfFormField.create({
    data: { formSetVersionId: v1, tab: "call_disposition", formTabId: srcTabId, formSectionId: section.id, fieldKey: "payment_mode", label: "Payment Mode", fieldType: "dropdown", sortOrder: 0 },
  });
  srcFieldId = field.id;
  await db.qcfFormFieldOption.createMany({
    data: [
      { formFieldId: srcFieldId, valueKey: "upi", label: "UPI", sortOrder: 0 },
      { formFieldId: srcFieldId, valueKey: "invoice", label: "Invoice", sortOrder: 1 },
    ],
  });

  const rule = await createFormRule({ formSetVersionId: v1, name: "show payment tab", matchType: "all", sortOrder: 0 });
  await addRuleCondition({ formRuleId: rule.id, subjectKind: "field", subjectFieldKey: "payment_mode", operator: "is", valueKeys: ["invoice"], sortOrder: 0 });
  await addRuleAction({ formRuleId: rule.id, actionType: "show_tab", targetKind: "tab", targetTabId: srcTabId, sortOrder: 0 });

  // A logged field value on v1 — record/history that must NOT be cloned.
  await db.qcfFieldValue.create({
    data: { orgId: TENANT, activityId: `act_${STAMP}`, formSetVersionId: v1, fieldKey: "payment_mode", valueType: "dropdown", valueText: "invoice" },
  });

  // Publish v1 so the clone source is a frozen, live version.
  await publishVersion(v1);
});

afterAll(async () => {
  const versions = await db.qcfFormSetVersion.findMany({ where: { formSetId: setId }, select: { id: true } });
  const vids = versions.map((v) => v.id);
  const tabs = await db.qcfFormTab.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  const fields = await db.qcfFormField.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  const rules = await db.qcfFormRule.findMany({ where: { formSetVersionId: { in: vids } }, select: { id: true } });
  const fieldIds = fields.map((f) => f.id);
  const ruleIds = rules.map((r) => r.id);
  const tabIds = tabs.map((t) => t.id);
  // detach currentVersion so versions can be deleted
  await db.qcfFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  if (ruleIds.length) {
    await db.qcfFormRuleAction.deleteMany({ where: { formRuleId: { in: ruleIds } } });
    await db.qcfFormRuleCondition.deleteMany({ where: { formRuleId: { in: ruleIds } } });
    await db.qcfFormRule.deleteMany({ where: { id: { in: ruleIds } } });
  }
  if (fieldIds.length) await db.qcfFormFieldOption.deleteMany({ where: { formFieldId: { in: fieldIds } } });
  await db.qcfFieldValue.deleteMany({ where: { orgId: TENANT } });
  await db.qcfFormField.deleteMany({ where: { formSetVersionId: { in: vids } } });
  if (tabIds.length) await db.qcfFormSection.deleteMany({ where: { formTabId: { in: tabIds } } });
  await db.qcfFormTab.deleteMany({ where: { formSetVersionId: { in: vids } } });
  await db.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qcfFormSet.deleteMany({ where: { id: setId } });
});

describe("cloneVersionToDraft — deep-copy completeness (the centerpiece)", () => {
  it("clones EVERY structural level into a new draft, and does NOT clone field values", async () => {
    const clone = await cloneVersionToDraft(v1);

    expect(clone.id).not.toBe(v1);
    expect(clone.status).toBe("draft");
    expect(clone.versionNumber).toBe(2); // next number
    expect(clone.formSetId).toBe(setId);

    const cid = clone.id;
    const [tabs, sections, fields, rules] = await Promise.all([
      db.qcfFormTab.findMany({ where: { formSetVersionId: cid } }),
      db.qcfFormSection.findMany({ where: { tab: { formSetVersionId: cid } } }),
      db.qcfFormField.findMany({ where: { formSetVersionId: cid } }),
      db.qcfFormRule.findMany({ where: { formSetVersionId: cid }, include: { conditions: true, actions: true } }),
    ]);

    expect(tabs).toHaveLength(1);
    expect(sections).toHaveLength(1);
    expect(fields).toHaveLength(1);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.conditions).toHaveLength(1); // <- not silently lost
    expect(rules[0]!.actions).toHaveLength(1); // <- not silently lost

    // options copied with the field
    const options = await db.qcfFormFieldOption.findMany({ where: { formFieldId: fields[0]!.id } });
    expect(options).toHaveLength(2);

    // field values are record/history — pinned to v1, NEVER cloned
    const clonedValues = await db.qcfFieldValue.count({ where: { formSetVersionId: cid } });
    expect(clonedValues).toBe(0);
    expect(await db.qcfFieldValue.count({ where: { formSetVersionId: v1 } })).toBe(1);
  });

  it("remaps intra-version references: the cloned action.targetTabId points at the NEW tab, not the source's", async () => {
    const clone = await cloneVersionToDraft(v1);
    const cid = clone.id;

    const newTab = await db.qcfFormTab.findFirst({ where: { formSetVersionId: cid } });
    const action = await db.qcfFormRuleAction.findFirst({ where: { rule: { formSetVersionId: cid }, actionType: "show_tab" } });

    expect(action!.targetTabId).toBe(newTab!.id);
    expect(action!.targetTabId).not.toBe(srcTabId); // the source tab must NOT leak into the clone
  });

  it("the clone is independent: editing it does not affect the source version", async () => {
    const clone = await cloneVersionToDraft(v1);
    await createFormTab({ formSetVersionId: clone.id, name: "Extra", visibility: "always", sortOrder: 9 });

    expect(await db.qcfFormTab.count({ where: { formSetVersionId: clone.id } })).toBe(2);
    expect(await db.qcfFormTab.count({ where: { formSetVersionId: v1 } })).toBe(1); // source untouched
  });
});

describe("assertDraft interaction — clone is the escape hatch, invariant holds", () => {
  it("a published version is frozen (assertDraft throws), but its clone is editable", async () => {
    await expect(assertDraft(v1)).rejects.toBeInstanceOf(FormStructureError); // published => frozen
    const clone = await cloneVersionToDraft(v1);
    await expect(assertDraft(clone.id)).resolves.toBeUndefined(); // draft => editable
  });
});

describe("publishVersion — lifecycle (draft -> published, previous retired, currentVersion set)", () => {
  it("publishing a draft makes it current and retires the previously-published version", async () => {
    const clone = await cloneVersionToDraft(v1); // draft
    const published = await publishVersion(clone.id);

    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    const set = await db.qcfFormSet.findUnique({ where: { id: setId }, select: { currentVersionId: true } });
    expect(set!.currentVersionId).toBe(clone.id); // new current

    const prev = await db.qcfFormSetVersion.findUnique({ where: { id: v1 }, select: { status: true } });
    expect(prev!.status).toBe("retired"); // the old published one is retired
  });

  it("rejects publishing a non-draft version", async () => {
    await expect(publishVersion(v1)).rejects.toBeInstanceOf(FormStructureError); // v1 is retired by now
  });
});
