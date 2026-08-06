/**
 * FR-RE Phase 2 — edit + delete contract (the persistence round-trip the wired
 * edit/delete UI depends on). The UI re-open/pre-populate widget is browser-
 * verified per convention; this locks the service+arity+cascade+draft-guard
 * beneath it.
 *
 * Covers:
 *   - edit round-trip is_any_of [A,B] -> [A,B,C] reads back length 3 IN ORDER
 *     (order must survive the UPDATE, not just create — the teeth);
 *   - single<->multi switch on edit (is [A] -> is_any_of [A,B] = 2; reverse = 1),
 *     arity staying valid across the switch;
 *   - 2-B action edit: change a set_stage target and a show_tab tab -> persists,
 *     reads back (the reason we chose condition+action edit);
 *   - delete cascades (rule gone; its conditions AND actions gone);
 *   - draft-guard: after publish, updateRuleCondition / updateRuleAction /
 *     deleteFormRule all reject.
 *
 * The publish/draft-guard case lives in its OWN form set (pubSetId) so publishing
 * it cannot cross-talk with the draft round-trip / action-edit cases (which run on
 * draftVersionId in a separate set). Resolved by construction, not by run-order.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import {
  createFormRule, addRuleCondition, updateRuleCondition,
  deleteFormRule, getFormRules,
} from "@/lib/services/forms/form-rule.service";
import { addRuleAction, updateRuleAction } from "@/lib/services/forms/form-rule-action.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";

const STAMP = Date.now();
const TENANT = `int_ed_${STAMP}`;
// set_stage targets are pipeline stages. No workspace config -> DEFAULT_STAGES.
const ST_A = "Contacted";
const ST_B = "Qualified";

let draftSetId: string;
let draftVersionId: string; // edit/round-trip/action cases
let pubSetId: string; // SEPARATE set for the publish/draft-guard case
let pubVersionId: string;
let tabA: string;
let tabB: string;

beforeAll(async () => {
  // Set 1 — the draft cases (never published).
  const draftSet = await db.crmFormSet.create({
    data: { tenantId: TENANT, surface: "call_disposition", name: `Draft Set ${STAMP}`, isDefault: true },
  });
  draftSetId = draftSet.id;
  draftVersionId = (await db.crmFormSetVersion.create({
    data: { formSetId: draftSetId, versionNumber: 1, status: "draft" },
  })).id;
  tabA = (await db.crmFormTab.create({ data: { formSetVersionId: draftVersionId, name: "Tab A", visibility: "rule_driven", sortOrder: 0 } })).id;
  tabB = (await db.crmFormTab.create({ data: { formSetVersionId: draftVersionId, name: "Tab B", visibility: "rule_driven", sortOrder: 1 } })).id;

  // Set 2 — the publish/draft-guard case, isolated so publishing can't disturb set 1.
  const pubSet = await db.crmFormSet.create({
    data: { tenantId: TENANT, surface: "call_disposition", name: `Pub Set ${STAMP}`, isDefault: false },
  });
  pubSetId = pubSet.id;
  pubVersionId = (await db.crmFormSetVersion.create({
    data: { formSetId: pubSetId, versionNumber: 1, status: "draft" },
  })).id;
});

afterAll(async () => {
  for (const sId of [draftSetId, pubSetId]) {
    const versions = await db.crmFormSetVersion.findMany({ where: { formSetId: sId }, select: { id: true } });
    for (const v of versions) {
      const rules = await db.crmFormRule.findMany({ where: { formSetVersionId: v.id }, select: { id: true } });
      const rids = rules.map((r) => r.id);
      if (rids.length) {
        await db.crmFormRuleAction.deleteMany({ where: { formRuleId: { in: rids } } });
        await db.crmFormRuleCondition.deleteMany({ where: { formRuleId: { in: rids } } });
        await db.crmFormRule.deleteMany({ where: { id: { in: rids } } });
      }
      await db.crmFormTab.deleteMany({ where: { formSetVersionId: v.id } });
    }
    await db.crmFormSet.update({ where: { id: sId }, data: { currentVersionId: null } });
    await db.crmFormSetVersion.deleteMany({ where: { formSetId: sId } });
    await db.crmFormSet.deleteMany({ where: { id: sId } });
  }
});

describe("Phase 2 — edit condition round-trip", () => {
  it("is_any_of [A,B] -> [A,B,C] reads back length 3 IN ORDER (order survives UPDATE)", async () => {
    const rule = await createFormRule({ formSetVersionId: draftVersionId, name: "edit-anyof", matchType: "all", sortOrder: 0 });
    const cond = await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is_any_of", valueKeys: ["A", "B"], sortOrder: 0 });

    await updateRuleCondition({ conditionId: cond.id, valueKeys: ["A", "B", "C"] });

    const read = await getFormRules(draftVersionId);
    expect(read.find((r) => r.id === rule.id)!.conditions[0].valueKeys).toEqual(["A", "B", "C"]);
  });

  it("single<->multi switch keeps arity valid: is [A] -> is_any_of [A,B] = 2; reverse = 1", async () => {
    const rule = await createFormRule({ formSetVersionId: draftVersionId, name: "edit-switch", matchType: "all", sortOrder: 1 });
    const cond = await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["A"], sortOrder: 0 });

    await updateRuleCondition({ conditionId: cond.id, operator: "is_any_of", valueKeys: ["A", "B"] });
    let read = await getFormRules(draftVersionId);
    expect(read.find((r) => r.id === rule.id)!.conditions[0].valueKeys).toEqual(["A", "B"]);

    await updateRuleCondition({ conditionId: cond.id, operator: "is", valueKeys: ["A"] });
    read = await getFormRules(draftVersionId);
    const back = read.find((r) => r.id === rule.id)!.conditions[0];
    expect(back.operator).toBe("is");
    expect(back.valueKeys).toEqual(["A"]);
  });
});

describe("Phase 2 — edit ACTION (2-B): set_stage target + show_tab tab", () => {
  it("set_stage target changes ST_A -> ST_B and persists", async () => {
    const rule = await createFormRule({ formSetVersionId: draftVersionId, name: "edit-setstage", matchType: "all", sortOrder: 2 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["X"], sortOrder: 0 });
    const action = await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: ST_A, sortOrder: 0 });

    const updated = await updateRuleAction({ actionId: action.id, setStatusId: ST_B });
    expect(updated.setStatusId).toBe(ST_B);
    const row = await db.crmFormRuleAction.findUnique({ where: { id: action.id } });
    expect(row!.setStatusId).toBe(ST_B);
  });

  it("show_tab target changes tabA -> tabB and persists", async () => {
    const rule = await createFormRule({ formSetVersionId: draftVersionId, name: "edit-showtab", matchType: "all", sortOrder: 3 });
    await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["Y"], sortOrder: 0 });
    const action = await addRuleAction({ formRuleId: rule.id, actionType: "show_tab", targetKind: "tab", targetTabId: tabA, sortOrder: 0 });

    await updateRuleAction({ actionId: action.id, targetTabId: tabB });
    const row = await db.crmFormRuleAction.findUnique({ where: { id: action.id } });
    expect(row!.targetTabId).toBe(tabB);
  });
});

describe("Phase 2 — delete cascades", () => {
  it("deleteFormRule removes the rule AND its conditions + actions", async () => {
    const rule = await createFormRule({ formSetVersionId: draftVersionId, name: "to-delete", matchType: "all", sortOrder: 4 });
    const cond = await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["Z"], sortOrder: 0 });
    const action = await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: ST_A, sortOrder: 0 });

    await deleteFormRule(rule.id);

    expect((await getFormRules(draftVersionId)).find((r) => r.id === rule.id)).toBeUndefined();
    expect(await db.crmFormRuleCondition.findUnique({ where: { id: cond.id } })).toBeNull();
    expect(await db.crmFormRuleAction.findUnique({ where: { id: action.id } })).toBeNull();
  });
});

describe("Phase 2 — draft-guard: published version is frozen", () => {
  it("after publish, update condition / update action / delete rule all reject", async () => {
    const rule = await createFormRule({ formSetVersionId: pubVersionId, name: "pub-rule", matchType: "all", sortOrder: 0 });
    const cond = await addRuleCondition({ formRuleId: rule.id, subjectKind: "status", operator: "is", valueKeys: ["A"], sortOrder: 0 });
    const action = await addRuleAction({ formRuleId: rule.id, actionType: "set_stage", targetKind: "stage", setStatusId: ST_A, sortOrder: 0 });

    await publishVersion(pubVersionId); // freezes THIS set's version only

    await expect(updateRuleCondition({ conditionId: cond.id, valueKeys: ["B"] })).rejects.toThrow();
    await expect(updateRuleAction({ actionId: action.id, setStatusId: ST_B })).rejects.toThrow();
    await expect(deleteFormRule(rule.id)).rejects.toThrow();
  });
});
