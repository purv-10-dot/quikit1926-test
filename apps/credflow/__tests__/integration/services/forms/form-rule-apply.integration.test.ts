/**
 * FR-RE Unit 6b (FR-RE-5/6) — APPLY the decision (impure half), real DB.
 *
 * Three seams:
 *   1. loadEvalRules  — Prisma rows (rules + conditions + actions) -> EvalRule[].
 *   2. loadEvalContext — lead stage/status/sub_stage + disposition field values
 *      -> 6a's EvalContext.
 *   3. applyFormRules  — evaluate (6a, pure) then apply: set_stage -> lead
 *      status/substatus write (name-based, Decision A). The write is a plain,
 *      terminal crmLead.update with no hook — reusing FR-D3's no-re-trigger
 *      discipline (the engine runs ONCE; the write does not start another round).
 *
 * The centerpiece is the END-TO-END one-hop test: rule A sets the lead to status
 * W, rule B is keyed on status W. After apply the lead is W (A fired) but NOT
 * the further status (B did not fire — it saw the INPUT context, not A's write).
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { createFormRule, addRuleCondition } from "@/lib/services/forms/form-rule.service";
import { addRuleAction } from "@/lib/services/forms/form-rule-action.service";
import {
  loadEvalRules,
  loadEvalContext,
  applyFormRules,
} from "@/lib/services/forms/form-rule-apply.service";

const STAMP = Date.now();
const TENANT = `int_frre_u6b_${STAMP}`;
// set_stage targets = configured pipeline stages. No workspace config for this
// tenant -> getPipelineConfig falls back to DEFAULT_STAGES, so these are valid.
const STAGE_A = "Contacted";
const STAGE_B = "Qualified";

let setId: string;
let vn = 1;

async function newVersion(): Promise<string> {
  const v = await integrationPrisma.crmFormSetVersion.create({
    data: { formSetId: setId, versionNumber: vn++, status: "draft" },
  });
  return v.id;
}

async function newLead(status = "Open", stage = "New", substatus: string | null = null): Promise<string> {
  const lead = await integrationPrisma.crmLead.create({
    data: { tenantId: TENANT, name: `Lead ${STAMP}-${vn}`, status, stage, substatus },
  });
  return lead.id;
}

beforeAll(async () => {
  const set = await integrationPrisma.crmFormSet.create({
    data: { tenantId: TENANT, surface: "call_disposition", name: `Set ${STAMP}` },
  });
  setId = set.id;
});

afterAll(async () => {
  const versions = await integrationPrisma.crmFormSetVersion.findMany({
    where: { formSetId: setId },
    select: { id: true },
  });
  const vids = versions.map((v) => v.id);
  const rules = await integrationPrisma.crmFormRule.findMany({
    where: { formSetVersionId: { in: vids } },
    select: { id: true },
  });
  const rids = rules.map((r) => r.id);
  if (rids.length) {
    await integrationPrisma.crmFormRuleAction.deleteMany({ where: { formRuleId: { in: rids } } });
    await integrationPrisma.crmFormRuleCondition.deleteMany({ where: { formRuleId: { in: rids } } });
    await integrationPrisma.crmFormRule.deleteMany({ where: { id: { in: rids } } });
  }
  await integrationPrisma.crmFieldValue.deleteMany({ where: { tenantId: TENANT } });
  await integrationPrisma.crmFormField.deleteMany({ where: { formSetVersionId: { in: vids } } });
  await integrationPrisma.crmFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await integrationPrisma.crmFormSet.deleteMany({ where: { id: setId } });
  await integrationPrisma.crmLead.deleteMany({ where: { tenantId: TENANT } });
});

describe("loadEvalRules — Prisma rows -> EvalRule[] adapter", () => {
  it("maps active rules with conditions + actions into the pure shape", async () => {
    const versionId = await newVersion();
    await integrationPrisma.crmFormField.create({
      data: { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "gst", label: "GST", fieldType: "text", sortOrder: 0 },
    });
    const rule = await createFormRule({ formSetVersionId: versionId, name: "adapter", matchType: "any", sortOrder: 0 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is_any_of", valueKeys: ["Open", "Working"], sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "show_field", targetKind: "field", targetFieldKey: "gst", sortOrder: 0 });

    const evalRules = await loadEvalRules(versionId);
    expect(evalRules).toHaveLength(1);
    const r = evalRules[0]!;
    expect(r.matchType).toBe("any");
    expect(r.isActive).toBe(true);
    expect(r.conditions[0]).toMatchObject({ subjectKind: "status", operator: "is_any_of" });
    expect(r.conditions[0]!.valueKeys).toEqual(["Open", "Working"]);
    expect(r.actions[0]).toMatchObject({ actionType: "show_field", targetFieldKey: "gst" });
  });

  it("excludes inactive rules from the eval set", async () => {
    const versionId = await newVersion();
    const rule = await createFormRule({ formSetVersionId: versionId, name: "inactive", matchType: "all", sortOrder: 0 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["Open"], sortOrder: 0 });
    await integrationPrisma.crmFormRule.update({ where: { id: rule.id }, data: { isActive: false } });

    expect(await loadEvalRules(versionId)).toHaveLength(0);
  });
});

describe("loadEvalContext — lead state + field values -> EvalContext", () => {
  it("loads lead stage/status/sub_stage and resolves field values by type", async () => {
    const versionId = await newVersion();
    const leadId = await newLead("Open", "New", "docs");
    const activityId = `act_${STAMP}_ctx`;
    await integrationPrisma.crmFieldValue.createMany({
      data: [
        { tenantId: TENANT, activityId, formSetVersionId: versionId, fieldKey: "payment_mode", valueType: "dropdown", valueText: "invoice" },
        { tenantId: TENANT, activityId, formSetVersionId: versionId, fieldKey: "owners", valueType: "user_picker", valueUserIds: ["u1", "u2"] },
      ],
    });

    const context = await loadEvalContext(leadId, activityId);
    expect(context.status).toBe("Open");
    expect(context.stage).toBe("New");
    expect(context.subStage).toBe("docs");
    expect(context.fieldValues.payment_mode).toBe("invoice");
    expect(context.fieldValues.owners).toEqual(["u1", "u2"]);
  });

  it("returns empty field values when there is no activity", async () => {
    const leadId = await newLead("Open");
    const context = await loadEvalContext(leadId, null);
    expect(context.fieldValues).toEqual({});
    expect(context.status).toBe("Open");
  });
});

describe("applyFormRules — set_stage writes the lead's Contact Stage, one hop, NO cascade", () => {
  it("END-TO-END: applies the first set_stage and does NOT cascade into a rule keyed on the new stage", async () => {
    const versionId = await newVersion();
    const leadId = await newLead("Open", "New");

    // Rule A: status is Open  -> set Contact Stage to STAGE_A
    const ruleA = await createFormRule({ formSetVersionId: versionId, name: "A", matchType: "all", sortOrder: 0 });
    await addRuleCondition({ formRuleId: ruleA.id, subjectKind: "status", operator: "is", valueKeys: ["Open"], sortOrder: 0 });
    await addRuleAction({ formRuleId: ruleA.id, actionType: "set_stage", targetKind: "stage", setStatusId: STAGE_A, sortOrder: 0 });

    // Rule B: stage is STAGE_A -> set Contact Stage to STAGE_B (must NOT fire from A's write)
    const ruleB = await createFormRule({ formSetVersionId: versionId, name: "B", matchType: "all", sortOrder: 1 });
    await addRuleCondition({ formRuleId: ruleB.id, subjectKind: "stage", operator: "is", valueKeys: [STAGE_A], sortOrder: 0 });
    await addRuleAction({ formRuleId: ruleB.id, actionType: "set_stage", targetKind: "stage", setStatusId: STAGE_B, sortOrder: 0 });

    const result = await applyFormRules({ tenantId: TENANT, leadId, activityId: null, formSetVersionId: versionId });

    expect(result.decision.setStage).toEqual({ status: STAGE_A, subStatus: null });
    expect(result.stageApplied).toBe(true);

    const lead = await integrationPrisma.crmLead.findUnique({ where: { id: leadId }, select: { stage: true } });
    expect(lead!.stage).toBe(STAGE_A); // A fired
    expect(lead!.stage).not.toBe(STAGE_B); // B did NOT fire — no cascade
  });

  it("a decision with no set_stage leaves the lead untouched and returns the visibility decision", async () => {
    const versionId = await newVersion();
    await integrationPrisma.crmFormField.create({
      data: { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "gst", label: "GST", fieldType: "text", sortOrder: 0 },
    });
    const leadId = await newLead("Open");
    const rule = await createFormRule({ formSetVersionId: versionId, name: "show-only", matchType: "all", sortOrder: 0 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["Open"], sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "show_field", targetKind: "field", targetFieldKey: "gst", sortOrder: 0 });

    const result = await applyFormRules({ tenantId: TENANT, leadId, activityId: null, formSetVersionId: versionId });

    expect(result.stageApplied).toBe(false);
    expect(result.decision.fieldVisibility.gst).toBe("show");
    const lead = await integrationPrisma.crmLead.findUnique({ where: { id: leadId }, select: { status: true } });
    expect(lead!.status).toBe("Open"); // untouched
  });
});
