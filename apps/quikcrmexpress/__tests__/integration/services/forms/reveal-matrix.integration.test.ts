/**
 * FR-RE Stage 4 — dynamic reveal coverage, real runtime + real evaluator.
 *
 * Builds its OWN rules in a fresh test tenant's live form (isolated, repeatable,
 * not coupled to CrmExpress's config) and evaluates through the SAME path the agent
 * uses: getCurrentDispositionRuntime -> evaluateFormRules. The render seam
 * (DispositionFieldGroups) is exercised separately in the browser.
 *
 * FRONT-LOADED (the two flagged as possible gaps), per the Stage 4 plan:
 *   #4  make_optional CANNOT relax a hard-required field (hard is absolute) —
 *       PASSING expectation, not a gap. make_optional only relaxes soft/none.
 *   #8  sub_stage-subject rule reveals on a Sub-Stage pick (newly wired in 3-B/C,
 *       never exercised live).
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormRule, addRuleCondition } from "@/lib/services/forms/form-rule.service";
import { addRuleAction } from "@/lib/services/forms/form-rule-action.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";
import { getCurrentDispositionRuntime } from "@/lib/services/forms/form-runtime.service";
import { evaluateFormRules } from "@/lib/services/forms/form-rule-evaluator";
import { fieldVisible, fieldRendered } from "@/lib/services/forms/field-visibility";

const STAMP = Date.now();
const TENANT = `int_frre_s4_${STAMP}`;
const STATUS = `S4Status_${STAMP}`; // #4 make_optional trigger
const SUBSTAGE = `S4Sub_${STAMP}`; // #8 sub_stage trigger
const ST_SHOW = `S4Show_${STAMP}`; // #1 show_field trigger
const ST_HIDE = `S4Hide_${STAMP}`; // #2 hide_field trigger
const ST_MAND = `S4Mand_${STAMP}`; // #3 make_mandatory trigger
const ST_MULTI = `S4Multi_${STAMP}`; // #5 multiple effects on one status
const ST_BOTH = `S4Both_${STAMP}`; // #6 set_stage + show_tab on one status
const ST_NONE = `S4None_${STAMP}`; // #9 a status with NO rule
const ST_ALL = `S4All_${STAMP}`; // #10 matchType "all": status AND field
const ST_TARGET = "Contacted"; // #6 set_stage destination (pipeline stage; DEFAULT_STAGES)

let setId: string;
let versionId: string;
let ruleTabId: string; // #8 sub_stage tab
let multiTabId: string; // #5 tab revealed alongside other effects
let bothTabId: string; // #6 tab revealed alongside set_stage

beforeAll(async () => {
  const set = await db.qceFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${STAMP}`, isDefault: true },
  });
  setId = set.id;
  const version = await db.qceFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  });
  versionId = version.id;

  // set_stage destination must be a configured pipeline stage (#6). No workspace
  // config for this tenant -> getPipelineConfig falls back to DEFAULT_STAGES.

  // Rule-driven tabs.
  ruleTabId = (await db.qceFormTab.create({
    data: { formSetVersionId: versionId, name: "Sub-Stage Tab", visibility: "rule_driven", sortOrder: 1 },
  })).id;
  multiTabId = (await db.qceFormTab.create({
    data: { formSetVersionId: versionId, name: "Multi Tab", visibility: "rule_driven", sortOrder: 2 },
  })).id;
  bothTabId = (await db.qceFormTab.create({
    data: { formSetVersionId: versionId, name: "Both Tab", visibility: "rule_driven", sortOrder: 3 },
  })).id;

  await db.qceFormField.createMany({
    data: [
      // #4 hard-required, #8 field on the sub-stage tab.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "hard_field", label: "Hard Field", fieldType: "text", requiredLevel: "hard", defaultVisibility: "visible", sortOrder: 0 },
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "sub_tab_field", label: "Sub Tab Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "visible", formTabId: ruleTabId, sortOrder: 1 },
      // #1 default-HIDDEN field revealed by show_field.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "hidden_field", label: "Hidden Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "hidden", sortOrder: 2 },
      // #2 default-VISIBLE field hidden by hide_field.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "visible_field", label: "Visible Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "visible", sortOrder: 3 },
      // #3 visible field made mandatory by rule.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "mand_field", label: "Mand Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "visible", sortOrder: 4 },
      // #5 field revealed alongside other effects (default-hidden).
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "multi_field", label: "Multi Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "hidden", sortOrder: 5 },
      // #7 field on a rule-driven tab (the multi tab), default-visible.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "multi_tab_field", label: "Multi Tab Field", fieldType: "text", requiredLevel: "soft", defaultVisibility: "visible", formTabId: multiTabId, sortOrder: 6 },
      // #10 field used in a matchType:"all" compound condition.
      { formSetVersionId: versionId, tab: "call_disposition", fieldKey: "all_field", label: "All Field", fieldType: "dropdown", requiredLevel: "soft", defaultVisibility: "hidden", sortOrder: 7 },
    ],
  });

  // #4 rule: a make_optional action targeting the HARD field, fired by STATUS.
  const r4 = await createFormRule({ formSetVersionId: versionId, name: "optional-on-hard", matchType: "all", sortOrder: 0 });
  await addRuleCondition({ formRuleId: r4.id, subjectKind: "status", operator: "is", valueKeys: [STATUS], sortOrder: 0 });
  await addRuleAction({ formRuleId: r4.id, actionType: "make_optional", targetKind: "field", targetFieldKey: "hard_field", sortOrder: 0 });

  // #8 rule: a sub_stage-subject show_tab revealing the rule-driven tab.
  const r8 = await createFormRule({ formSetVersionId: versionId, name: "substage -> show tab", matchType: "all", sortOrder: 1 });
  await addRuleCondition({ formRuleId: r8.id, subjectKind: "sub_stage", operator: "is", valueKeys: [SUBSTAGE], sortOrder: 0 });
  await addRuleAction({ formRuleId: r8.id, actionType: "show_tab", targetKind: "tab", targetTabId: ruleTabId, sortOrder: 0 });

  // #1 show_field on a default-hidden field, status trigger.
  const r1 = await createFormRule({ formSetVersionId: versionId, name: "show hidden_field", matchType: "all", sortOrder: 2 });
  await addRuleCondition({ formRuleId: r1.id, subjectKind: "status", operator: "is", valueKeys: [ST_SHOW], sortOrder: 0 });
  await addRuleAction({ formRuleId: r1.id, actionType: "show_field", targetKind: "field", targetFieldKey: "hidden_field", sortOrder: 0 });

  // #2 hide_field on a default-visible field, status trigger.
  const r2 = await createFormRule({ formSetVersionId: versionId, name: "hide visible_field", matchType: "all", sortOrder: 3 });
  await addRuleCondition({ formRuleId: r2.id, subjectKind: "status", operator: "is", valueKeys: [ST_HIDE], sortOrder: 0 });
  await addRuleAction({ formRuleId: r2.id, actionType: "hide_field", targetKind: "field", targetFieldKey: "visible_field", sortOrder: 0 });

  // #3 make_mandatory on a visible field, status trigger.
  const r3 = await createFormRule({ formSetVersionId: versionId, name: "mandatory mand_field", matchType: "all", sortOrder: 4 });
  await addRuleCondition({ formRuleId: r3.id, subjectKind: "status", operator: "is", valueKeys: [ST_MAND], sortOrder: 0 });
  await addRuleAction({ formRuleId: r3.id, actionType: "make_mandatory", targetKind: "field", targetFieldKey: "mand_field", sortOrder: 0 });

  // #5 THREE effects on ONE status: show_tab + show_field + make_mandatory.
  const r5 = await createFormRule({ formSetVersionId: versionId, name: "multi effects", matchType: "all", sortOrder: 5 });
  await addRuleCondition({ formRuleId: r5.id, subjectKind: "status", operator: "is", valueKeys: [ST_MULTI], sortOrder: 0 });
  await addRuleAction({ formRuleId: r5.id, actionType: "show_tab", targetKind: "tab", targetTabId: multiTabId, sortOrder: 0 });
  await addRuleAction({ formRuleId: r5.id, actionType: "show_field", targetKind: "field", targetFieldKey: "multi_field", sortOrder: 1 });
  await addRuleAction({ formRuleId: r5.id, actionType: "make_mandatory", targetKind: "field", targetFieldKey: "multi_field", sortOrder: 2 });

  // #6 set_stage AND show_tab on one status.
  const r6 = await createFormRule({ formSetVersionId: versionId, name: "stage + tab", matchType: "all", sortOrder: 6 });
  await addRuleCondition({ formRuleId: r6.id, subjectKind: "status", operator: "is", valueKeys: [ST_BOTH], sortOrder: 0 });
  await addRuleAction({ formRuleId: r6.id, actionType: "set_stage", targetKind: "stage", setStatusId: ST_TARGET, sortOrder: 0 });
  await addRuleAction({ formRuleId: r6.id, actionType: "show_tab", targetKind: "tab", targetTabId: bothTabId, sortOrder: 1 });

  // #10 matchType "all": status AND a field value -> show_field.
  const r10 = await createFormRule({ formSetVersionId: versionId, name: "compound all", matchType: "all", sortOrder: 7 });
  await addRuleCondition({ formRuleId: r10.id, subjectKind: "status", operator: "is", valueKeys: [ST_ALL], sortOrder: 0 });
  await addRuleCondition({ formRuleId: r10.id, subjectKind: "field", subjectFieldKey: "all_field", operator: "is", valueKeys: ["yes"], sortOrder: 1 });
  await addRuleAction({ formRuleId: r10.id, actionType: "show_field", targetKind: "field", targetFieldKey: "all_field", sortOrder: 0 });

  await publishVersion(versionId);
});

afterAll(async () => {
  const rules = await db.qceFormRule.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const rids = rules.map((r) => r.id);
  if (rids.length) {
    await db.qceFormRuleAction.deleteMany({ where: { formRuleId: { in: rids } } });
    await db.qceFormRuleCondition.deleteMany({ where: { formRuleId: { in: rids } } });
    await db.qceFormRule.deleteMany({ where: { id: { in: rids } } });
  }
  await db.qceFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await db.qceFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await db.qceFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.qceFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.qceFormSet.deleteMany({ where: { id: setId } });
});

/** Helper: the live decision for a given context, through the real runtime. */
async function decide(ctx: { status?: string | null; subStage?: string | null; fieldValues?: Record<string, string | string[]> }) {
  const rt = await getCurrentDispositionRuntime(TENANT);
  expect(rt).not.toBeNull();
  return {
    rt: rt!,
    decision: evaluateFormRules(
      { fieldValues: ctx.fieldValues ?? {}, stage: null, status: ctx.status ?? null, subStage: ctx.subStage ?? null },
      rt!.rules,
    ),
  };
}

describe("Stage 4 #4 — make_optional CANNOT relax a hard-required field (hard is absolute)", () => {
  it("hard field STAYS required even when a make_optional rule fires on it", async () => {
    const rt = await getCurrentDispositionRuntime(TENANT);
    expect(rt).not.toBeNull();

    // Status picked -> the make_optional rule fires.
    const decision = evaluateFormRules(
      { fieldValues: {}, stage: null, status: STATUS, subStage: null },
      rt!.rules,
    );
    const hardField = rt!.fields.find((f) => f.fieldKey === "hard_field")!;

    // The two facts the submit guard combines (frreFieldMandatory =
    // requiredLevel === "hard" || fieldRequirement === "mandatory"):
    //   1. the field is HARD-required by definition, and
    //   2. make_optional records at most "optional" (engine line 175-178 never
    //      sets "mandatory"; it cannot write "hard").
    // => hard || (optional|undefined) === required. Hard is absolute.
    expect(hardField.requiredLevel).toBe("hard");
    expect(decision.fieldRequirement.hard_field).not.toBe("mandatory");
    // The guard's result is therefore `true` (required), which is the LOCKED
    // behavior: make_optional only relaxes soft/none, never hard.
    const stillRequired =
      hardField.requiredLevel === "hard" ||
      decision.fieldRequirement.hard_field === "mandatory";
    expect(stillRequired).toBe(true);
  });
});

describe("Stage 4 #8 — sub_stage-subject rule reveals on a Sub-Stage pick", () => {
  it("the rule-driven tab is revealed when subStage matches (not before)", async () => {
    const rt = await getCurrentDispositionRuntime(TENANT);
    expect(rt).not.toBeNull();

    // No sub-stage picked yet -> tab NOT revealed.
    const before = evaluateFormRules(
      { fieldValues: {}, stage: null, status: null, subStage: null },
      rt!.rules,
    );
    expect(before.tabsToShow).not.toContain(ruleTabId);

    // Sub-stage picked -> the sub_stage-subject show_tab rule fires.
    const after = evaluateFormRules(
      { fieldValues: {}, stage: null, status: null, subStage: SUBSTAGE },
      rt!.rules,
    );
    expect(after.tabsToShow).toContain(ruleTabId);
  });
});

describe("Stage 4 #1 — show_field reveals a default-hidden field on status pick", () => {
  it("hidden by default; visible only when the status fires show_field", async () => {
    const f = { fieldKey: "hidden_field", defaultVisibility: "hidden" as const };
    const none = (await decide({})).decision;
    expect(fieldVisible(f, none)).toBe(false); // default-hidden, no rule
    const on = (await decide({ status: ST_SHOW })).decision;
    expect(on.fieldVisibility.hidden_field).toBe("show");
    expect(fieldVisible(f, on)).toBe(true);
  });
});

describe("Stage 4 #2 — hide_field hides a default-visible field on status pick", () => {
  it("visible by default; hidden when the status fires hide_field", async () => {
    const f = { fieldKey: "visible_field", defaultVisibility: "visible" as const };
    const none = (await decide({})).decision;
    expect(fieldVisible(f, none)).toBe(true); // default-visible, no rule
    const on = (await decide({ status: ST_HIDE })).decision;
    expect(on.fieldVisibility.visible_field).toBe("hide");
    expect(fieldVisible(f, on)).toBe(false);
  });
});

describe("Stage 4 #3 — make_mandatory marks a field mandatory on status pick", () => {
  // NOTE: the * + submit-block (frreFieldMandatory, a .tsx) is the REQUIRED
  // browser assertion; here we prove the engine records the requirement.
  it("engine records fieldRequirement = mandatory for the field", async () => {
    const none = (await decide({})).decision;
    expect(none.fieldRequirement.mand_field).toBeUndefined();
    const on = (await decide({ status: ST_MAND })).decision;
    expect(on.fieldRequirement.mand_field).toBe("mandatory");
  });
});

describe("Stage 4 #5 — multiple effects on ONE status all apply together", () => {
  it("show_tab + show_field + make_mandatory all land in one decision", async () => {
    const { decision } = await decide({ status: ST_MULTI });
    expect(decision.tabsToShow).toContain(multiTabId); // show_tab
    expect(decision.fieldVisibility.multi_field).toBe("show"); // show_field
    expect(decision.fieldRequirement.multi_field).toBe("mandatory"); // make_mandatory
  });
});

describe("Stage 4 #6 — one status with BOTH set_stage and show_tab", () => {
  it("the tab reveals AND the stage hint is set, on one pick", async () => {
    const { decision } = await decide({ status: ST_BOTH });
    expect(decision.tabsToShow).toContain(bothTabId); // show_tab
    expect(decision.setStage?.status).toBe(ST_TARGET); // set_stage
  });
});

describe("Stage 4 #7 — field on a rule-driven tab renders only when the tab is revealed", () => {
  it("multi_tab_field: hidden until its tab is revealed, then rendered", async () => {
    const { rt } = await decide({});
    const field = rt.fields.find((f) => f.fieldKey === "multi_tab_field")!;
    const tabsById = new Map(rt.tabs.map((t) => [t.id, { id: t.id, visibility: t.visibility }]));
    const visField = { fieldKey: field.fieldKey, defaultVisibility: field.defaultVisibility, formTabId: field.formTabId };

    const off = (await decide({})).decision;
    expect(fieldRendered(visField, off, tabsById)).toBe(false); // tab hidden -> not rendered
    const on = (await decide({ status: ST_MULTI })).decision; // ST_MULTI reveals multiTabId
    expect(fieldRendered(visField, on, tabsById)).toBe(true); // tab revealed -> rendered
  });
});

describe("Stage 4 #9 — a status with NO rule yields a neutral decision", () => {
  it("nothing reveals, nothing required, no stage hop", async () => {
    const { decision } = await decide({ status: ST_NONE });
    expect(decision.tabsToShow).toEqual([]);
    expect(decision.fieldVisibility).toEqual({});
    expect(decision.fieldRequirement).toEqual({});
    expect(decision.setStage).toBeNull();
  });
});

describe("Stage 4 #10 — matchType 'all': fires only when status AND field both match", () => {
  it("status alone does NOT fire; status + field value DOES", async () => {
    const statusOnly = (await decide({ status: ST_ALL })).decision;
    expect(statusOnly.fieldVisibility.all_field).toBeUndefined(); // field condition unmet

    const both = (await decide({ status: ST_ALL, fieldValues: { all_field: "yes" } })).decision;
    expect(both.fieldVisibility.all_field).toBe("show"); // both conditions met
  });
});
