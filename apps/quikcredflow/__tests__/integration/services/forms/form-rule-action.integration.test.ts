/**
 * FR-RE Unit 5 (FR-RE-A1..A7) — rule action builder, real DB.
 *
 * set_stage moves the lead's CONTACT STAGE (lead.stage). Its target (setStatusId
 * — a logical String reference, kept named for the schema column) MUST be a
 * configured pipeline stage; validate-at-build rejects a stage the tenant hasn't
 * configured. This suite PROVES that rejection.
 *
 * Validate-at-build is applied to ALL target kinds (field/tab/stage), consistent
 * with Unit 4's condition field-reference policy.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { createFormRule } from "@/lib/services/forms/form-rule.service";
import {
  addRuleAction,
  getRuleActions,
  FormRuleError,
} from "@/lib/services/forms/form-rule-action.service";

const STAMP = Date.now();
const TENANT = `int_frre_u5_${STAMP}`;
// Globally-unique status names (QcfLeadStatus has no orgId; name is @unique).
const STATUS = `Working_${STAMP}`;
const SUB_MAPPED = `AwaitingDocs_${STAMP}`;
const SUB_UNMAPPED = `Unrelated_${STAMP}`;

let setId: string;
let versionId: string;
let tabId: string;
let ruleId: string;
let statusId: string;
let subMappedId: string;
let subUnmappedId: string;

beforeAll(async () => {
  const set = await integrationPrisma.qcfFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}` },
  });
  setId = set.id;
  const version = await integrationPrisma.qcfFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  });
  versionId = version.id;

  // A field (field-target tests) and a tab (tab-target tests).
  await integrationPrisma.qcfFormField.create({
    data: { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "gstin", label: "GSTIN", fieldType: "text", sortOrder: 0 },
  });
  const tab = await integrationPrisma.qcfFormTab.create({
    data: { formSetVersionId: versionId, name: `Tab ${STAMP}`, visibility: "rule_driven", sortOrder: 1, isProtected: false },
  });
  tabId = tab.id;

  // Lead status + two sub-statuses; only SUB_MAPPED is mapped to the status.
  const status = await integrationPrisma.qcfLeadStatus.create({ data: { name: STATUS } });
  statusId = status.id;
  const subA = await integrationPrisma.qcfLeadSubStatus.create({ data: { name: SUB_MAPPED } });
  const subB = await integrationPrisma.qcfLeadSubStatus.create({ data: { name: SUB_UNMAPPED } });
  subMappedId = subA.id;
  subUnmappedId = subB.id;
  await integrationPrisma.qcfLeadStatusSubStatus.create({
    data: { leadStatusId: statusId, leadSubStatusId: subMappedId },
  });

  const rule = await createFormRule({
    formSetVersionId: versionId,
    name: "actions rule",
    matchType: "all",
    sortOrder: 0,
  });
  ruleId = rule.id;
});

afterAll(async () => {
  const rules = await integrationPrisma.qcfFormRule.findMany({
    where: { formSetVersionId: versionId },
    select: { id: true },
  });
  const ids = rules.map((r) => r.id);
  if (ids.length) {
    await integrationPrisma.qcfFormRuleAction.deleteMany({ where: { formRuleId: { in: ids } } });
    await integrationPrisma.qcfFormRule.deleteMany({ where: { id: { in: ids } } });
  }
  await integrationPrisma.qcfLeadStatusSubStatus.deleteMany({ where: { leadStatusId: statusId } });
  await integrationPrisma.qcfLeadSubStatus.deleteMany({ where: { id: { in: [subMappedId, subUnmappedId] } } });
  await integrationPrisma.qcfLeadStatus.deleteMany({ where: { id: statusId } });
  await integrationPrisma.qcfFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await integrationPrisma.qcfFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await integrationPrisma.qcfFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await integrationPrisma.qcfFormSet.deleteMany({ where: { id: setId } });
});

describe("set_stage Contact-Stage-target validation", () => {
  // No workspace config for this tenant -> getPipelineConfig falls back to
  // DEFAULT_STAGES (New/Contacted/Qualified/…), so "Contacted" is a valid target.
  const VALID_STAGE = "Contacted";

  it("REJECTS set_stage targeting a stage that is not configured", async () => {
    await expect(
      addRuleAction({
        formRuleId: ruleId,
        actionType: "set_stage",
        targetKind: "stage",
        setStatusId: `Ghost_${STAMP}`,
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(FormRuleError);
  });

  it("ACCEPTS set_stage with a configured pipeline stage", async () => {
    const action = await addRuleAction({
      formRuleId: ruleId,
      actionType: "set_stage",
      targetKind: "stage",
      setStatusId: VALID_STAGE,
      sortOrder: 2,
    });
    expect(action.actionType).toBe("set_stage");
    expect(action.setStatusId).toBe(VALID_STAGE);
  });
});

describe("validate-at-build for field & tab targets", () => {
  it("REJECTS show_field targeting a nonexistent field", async () => {
    await expect(
      addRuleAction({ formRuleId: ruleId, actionType: "show_field", targetKind: "field", targetFieldKey: "ghost", sortOrder: 3 }),
    ).rejects.toBeInstanceOf(FormRuleError);
  });

  it("ACCEPTS show_field targeting an existing field", async () => {
    const action = await addRuleAction({
      formRuleId: ruleId,
      actionType: "show_field",
      targetKind: "field",
      targetFieldKey: "gstin",
      sortOrder: 4,
    });
    expect(action.targetFieldKey).toBe("gstin");
  });

  it("REJECTS show_tab targeting a nonexistent tab", async () => {
    await expect(
      addRuleAction({ formRuleId: ruleId, actionType: "show_tab", targetKind: "tab", targetTabId: "tab_ghost", sortOrder: 5 }),
    ).rejects.toBeInstanceOf(FormRuleError);
  });

  it("ACCEPTS show_tab targeting an existing tab in the version", async () => {
    const action = await addRuleAction({
      formRuleId: ruleId,
      actionType: "show_tab",
      targetKind: "tab",
      targetTabId: tabId,
      sortOrder: 6,
    });
    expect(action.targetTabId).toBe(tabId);
  });
});

describe("model supports Unit 6 hidden-wins resolution", () => {
  it("stores show_field and hide_field for the same field as distinct, unambiguous action rows", async () => {
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: "conflict rule",
      matchType: "all",
      sortOrder: 1,
    });
    await addRuleAction({ formRuleId: rule.id, actionType: "show_field", targetKind: "field", targetFieldKey: "gstin", sortOrder: 0 });
    await addRuleAction({ formRuleId: rule.id, actionType: "hide_field", targetKind: "field", targetFieldKey: "gstin", sortOrder: 1 });

    const actions = await getRuleActions(rule.id);
    const onGstin = actions.filter((a) => a.targetFieldKey === "gstin");
    expect(onGstin.map((a) => a.actionType).sort()).toEqual(["hide_field", "show_field"]);
    // Same target, opposing actionType, distinct rows -> Unit 6 can resolve hidden-wins.
  });
});
