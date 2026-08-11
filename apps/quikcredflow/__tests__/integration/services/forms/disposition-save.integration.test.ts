/**
 * FR-RE save-wiring — connect the engine to the disposition save, real DB.
 *
 * Two pieces, both fully SYNCHRONOUS (no Redis/queue -> localhost-verifiable):
 *   1. saveDispositionFieldValues — persist the custom field values the agent
 *      entered, keyed to (activityId, form_set_version), typed by the field def.
 *   2. saveAndApplyDisposition — resolve the live form version, write the field
 *      values, then run applyFormRules (Unit 6b) and return the decision.
 *
 * THE END-TO-END DEMO SCENARIO: the agent enters a field value, a rule keyed on
 * that field fires, and the lead's Contact Stage moves — proven here against the DB.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormRule, addRuleCondition } from "@/lib/services/forms/form-rule.service";
import { addRuleAction } from "@/lib/services/forms/form-rule-action.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";
import {
  saveDispositionFieldValues,
  saveAndApplyDisposition,
  getLiveDispositionVersionId,
} from "@/lib/services/forms/disposition-save.service";

const STAMP = Date.now();
const TENANT = `int_frre_sw_${STAMP}`;
const EMPTY_TENANT = `int_frre_sw_none_${STAMP}`;
// set_stage target = a configured pipeline stage. No workspace config for this
// tenant -> getPipelineConfig falls back to DEFAULT_STAGES, so "Contacted" is valid.
const TARGET_STAGE = "Contacted";

let setId: string;
let versionId: string;

beforeAll(async () => {
  const set = await db.qcfFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}`, isDefault: true },
  });
  setId = set.id;
  const version = await db.qcfFormSetVersion.create({ data: { formSetId: setId, versionNumber: 1, status: "draft" } });
  versionId = version.id;

  // Fields the agent fills (typed): a dropdown + a user_picker.
  await db.qcfFormField.createMany({
    data: [
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "payment_mode", label: "Payment Mode", fieldType: "dropdown", sortOrder: 0 },
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "verifiers", label: "Verifiers", fieldType: "user_picker", sortOrder: 1 },
    ],
  });

  // Rule: payment_mode is "invoice" -> set Contact Stage to Contacted.
  const rule = await createFormRule({ formSetVersionId: versionId, name: "invoice -> contacted", matchType: "all", sortOrder: 0 });
  await addRuleCondition({ formRuleId: rule.id, subjectKind: "field", subjectFieldKey: "payment_mode", operator: "is", valueKeys: ["invoice"], sortOrder: 0 });
  await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: TARGET_STAGE, sortOrder: 0 });

  // Publish so it is the LIVE version (sets formSet.currentVersionId).
  await publishVersion(versionId);
});

afterAll(async () => {
  const rules = await db.qcfFormRule.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const rids = rules.map((r) => r.id);
  if (rids.length) {
    await db.qcfFormRuleAction.deleteMany({ where: { formRuleId: { in: rids } } });
    await db.qcfFormRuleCondition.deleteMany({ where: { formRuleId: { in: rids } } });
    await db.qcfFormRule.deleteMany({ where: { id: { in: rids } } });
  }
  await db.qcfFieldValue.deleteMany({ where: { orgId: TENANT } });
  await db.qcfFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await db.qcfFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qcfFormSet.deleteMany({ where: { id: setId } });
  await db.qcfLead.deleteMany({ where: { orgId: TENANT } });
});

describe("getLiveDispositionVersionId — resolve the live (currentVersion) form version", () => {
  it("returns the published default form set's current version", async () => {
    expect(await getLiveDispositionVersionId(TENANT)).toBe(versionId);
  });
  it("returns null for a tenant with no configured form set (legacy only)", async () => {
    expect(await getLiveDispositionVersionId(EMPTY_TENANT)).toBeNull();
  });
});

describe("saveDispositionFieldValues — persist typed custom field values", () => {
  it("writes each value to the right column for its field type", async () => {
    const activityId = `act_${STAMP}_fv`;
    await saveDispositionFieldValues({
      orgId: TENANT,
      activityId,
      formSetVersionId: versionId,
      fieldValues: { payment_mode: "invoice", verifiers: ["u1", "u2"] },
    });

    const drop = await db.qcfFieldValue.findUnique({ where: { activityId_fieldKey: { activityId, fieldKey: "payment_mode" } } });
    expect(drop).toMatchObject({ valueType: "dropdown", valueText: "invoice" });

    const picker = await db.qcfFieldValue.findUnique({ where: { activityId_fieldKey: { activityId, fieldKey: "verifiers" } } });
    expect(picker!.valueType).toBe("user_picker");
    expect(picker!.valueUserIds).toEqual(["u1", "u2"]);
  });

  it("ignores values for fields not defined in the version (server-authoritative)", async () => {
    const activityId = `act_${STAMP}_unknown`;
    await saveDispositionFieldValues({
      orgId: TENANT,
      activityId,
      formSetVersionId: versionId,
      fieldValues: { not_a_field: "x" },
    });
    expect(await db.qcfFieldValue.count({ where: { activityId } })).toBe(0);
  });
});

describe("saveAndApplyDisposition — END-TO-END: entered field drives the rule, Contact Stage moves", () => {
  it("writes the field value, fires the rule, and moves the lead's Contact Stage", async () => {
    const lead = await db.qcfLead.create({ data: { orgId: TENANT, name: `Lead ${STAMP}`, status: "Open", stage: "New" } });
    const activityId = `act_${STAMP}_e2e`;

    const result = await saveAndApplyDisposition({
      orgId: TENANT,
      leadId: lead.id,
      activityId,
      fieldValues: { payment_mode: "invoice" },
    });

    expect(result).not.toBeNull();
    expect(result!.versionId).toBe(versionId);
    expect(result!.decision.setStage).toEqual({ status: TARGET_STAGE, subStatus: null });
    expect(result!.stageApplied).toBe(true);
    expect(result!.previousStage).toBe("New");

    const after = await db.qcfLead.findUnique({ where: { id: lead.id }, select: { stage: true } });
    expect(after!.stage).toBe(TARGET_STAGE); // the entered field value drove the rule

    // the field value was persisted for evaluation + later reporting
    const fv = await db.qcfFieldValue.findUnique({ where: { activityId_fieldKey: { activityId, fieldKey: "payment_mode" } } });
    expect(fv!.valueText).toBe("invoice");
  });

  it("returns null (no-op, legacy path) when the tenant has no live form set", async () => {
    const result = await saveAndApplyDisposition({
      orgId: EMPTY_TENANT,
      leadId: "no_lead",
      activityId: `act_${STAMP}_none`,
      fieldValues: { payment_mode: "invoice" },
    });
    expect(result).toBeNull();
  });
});

/**
 * Option A ordering: FR-RE runs LAST. The lead's pre-set stage stands in for
 * "the built-in disposition mapping already ran"; FR-RE then OVERRIDES it when a
 * rule fires, and LEAVES IT UNTOUCHED when no rule fires.
 */
describe("Option A ordering — FR-RE overrides the mapping when fired, legacy stands when not", () => {
  it("FR-RE OVERRIDES the (legacy-mapped) Contact Stage when a rule fires", async () => {
    const lead = await db.qcfLead.create({ data: { orgId: TENANT, name: `Lead ${STAMP}-ovr`, status: "Open", stage: "MappedStage" } });
    const result = await saveAndApplyDisposition({
      orgId: TENANT,
      leadId: lead.id,
      activityId: `act_${STAMP}_ovr`,
      fieldValues: { payment_mode: "invoice" }, // matches the rule
    });
    expect(result!.stageApplied).toBe(true);
    const after = await db.qcfLead.findUnique({ where: { id: lead.id }, select: { stage: true } });
    expect(after!.stage).toBe(TARGET_STAGE); // FR-RE overrode "MappedStage"
  });

  it("the legacy-mapped Contact Stage STANDS when no FR-RE rule fires", async () => {
    const lead = await db.qcfLead.create({ data: { orgId: TENANT, name: `Lead ${STAMP}-keep`, status: "Open", stage: "MappedStage" } });
    const result = await saveAndApplyDisposition({
      orgId: TENANT,
      leadId: lead.id,
      activityId: `act_${STAMP}_keep`,
      fieldValues: { payment_mode: "cash" }, // matches no rule
    });
    expect(result!.decision.setStage).toBeNull();
    expect(result!.stageApplied).toBe(false);
    const after = await db.qcfLead.findUnique({ where: { id: lead.id }, select: { stage: true } });
    expect(after!.stage).toBe("MappedStage"); // untouched — legacy result stands
  });
});
