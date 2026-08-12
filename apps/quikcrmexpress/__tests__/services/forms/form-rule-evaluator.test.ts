/**
 * FR-RE Unit 6a (FR-RE-5/6) — pure rule EVALUATION engine.
 *
 * Context in -> resolved Decision out. NO side effects: no DB, no lead writes,
 * no form rendering. Applying the decision (set_stage write, visibility surfaced
 * to the form) is Unit 6b.
 *
 * Cascade discipline reused from FR-D3 (disposition-rule-engine): a stage decided
 * by a rule does NOT re-trigger evaluation — conditions are evaluated ONLY against
 * the INPUT context, never against the engine's own decision (one-hop, no loops).
 * String comparisons are case-insensitive + trimmed (FR-D3 "Condition 1").
 *
 * Pure function -> all coverage is unit-level (no integration suite needed).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateFormRules,
  type EvalContext,
  type EvalRule,
  type EvalCondition,
  type EvalAction,
} from "@/lib/services/forms/form-rule-evaluator";

// ── builders ──────────────────────────────────────────────────────────────────
let seq = 0;
function rule(
  conditions: EvalCondition[],
  actions: EvalAction[],
  opts: { matchType?: "all" | "any"; isActive?: boolean; sortOrder?: number } = {},
): EvalRule {
  return {
    matchType: opts.matchType ?? "all",
    isActive: opts.isActive ?? true,
    sortOrder: opts.sortOrder ?? seq++,
    conditions,
    actions,
  };
}
const cond = (
  subjectKind: EvalCondition["subjectKind"],
  operator: EvalCondition["operator"],
  valueKeys?: string[] | null,
  subjectFieldKey?: string,
): EvalCondition => ({ subjectKind, subjectFieldKey, operator, valueKeys });
const showField = (k: string, sortOrder = 0): EvalAction => ({ actionType: "show_field", targetFieldKey: k, sortOrder });
const hideField = (k: string, sortOrder = 0): EvalAction => ({ actionType: "hide_field", targetFieldKey: k, sortOrder });
const mandatory = (k: string, sortOrder = 0): EvalAction => ({ actionType: "make_mandatory", targetFieldKey: k, sortOrder });
const optional = (k: string, sortOrder = 0): EvalAction => ({ actionType: "make_optional", targetFieldKey: k, sortOrder });
const showTab = (t: string, sortOrder = 0): EvalAction => ({ actionType: "show_tab", targetTabId: t, sortOrder });
const setStage = (status: string, subStatus?: string, sortOrder = 0): EvalAction => ({
  actionType: "set_stage",
  setStatusId: status,
  setSubStatusId: subStatus ?? null,
  sortOrder,
});

const ctx = (c: Partial<EvalContext>): EvalContext => ({ fieldValues: {}, ...c });

// ── operators (match + non-match) ───────────────────────────────────────────────
describe("operators — each tested for match AND non-match", () => {
  const base = ctx({ status: "interested" });

  it("is — matches equal, not unequal", () => {
    expect(evaluateFormRules(base, [rule([cond("status", "is", ["interested"])], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(base, [rule([cond("status", "is", ["other"])], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("is_not — matches unequal, not equal", () => {
    expect(evaluateFormRules(base, [rule([cond("status", "is_not", ["other"])], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(base, [rule([cond("status", "is_not", ["interested"])], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("is_any_of — matches if value in set, not if absent", () => {
    expect(evaluateFormRules(base, [rule([cond("status", "is_any_of", ["x", "interested"])], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(base, [rule([cond("status", "is_any_of", ["x", "y"])], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("is_none_of — matches if absent, not if present", () => {
    expect(evaluateFormRules(base, [rule([cond("status", "is_none_of", ["x", "y"])], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(base, [rule([cond("status", "is_none_of", ["interested"])], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("is_empty — matches absent value, not a present one", () => {
    expect(evaluateFormRules(ctx({ status: null }), [rule([cond("status", "is_empty")], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(base, [rule([cond("status", "is_empty")], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("is_not_empty — matches present value, not an absent one", () => {
    expect(evaluateFormRules(base, [rule([cond("status", "is_not_empty")], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(ctx({ status: null }), [rule([cond("status", "is_not_empty")], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });

  it("comparisons are case-insensitive + trimmed (FR-D3 Condition 1)", () => {
    expect(evaluateFormRules(ctx({ status: "  Interested " }), [rule([cond("status", "is", ["INTERESTED"])], [showField("a")])]).fieldVisibility.a).toBe("show");
  });
});

// ── subject kinds ───────────────────────────────────────────────────────────────
describe("subject kinds — field / stage / status / sub_stage", () => {
  it("field subject compares the field value", () => {
    const c = ctx({ fieldValues: { payment_mode: "invoice" } });
    expect(evaluateFormRules(c, [rule([cond("field", "is", ["invoice"], "payment_mode")], [showField("gst")])]).fieldVisibility.gst).toBe("show");
  });
  it("stage / sub_stage subjects compare their context slots", () => {
    expect(evaluateFormRules(ctx({ stage: "New" }), [rule([cond("stage", "is", ["New"])], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(ctx({ subStage: "docs" }), [rule([cond("sub_stage", "is", ["docs"])], [showField("a")])]).fieldVisibility.a).toBe("show");
  });
});

// ── matchType ─────────────────────────────────────────────────────────────────
describe("matchType all vs any (with boundaries)", () => {
  const c = ctx({ status: "interested", stage: "New" });

  it("all — fires only when EVERY condition matches", () => {
    const allMatch = rule([cond("status", "is", ["interested"]), cond("stage", "is", ["New"])], [showField("a")], { matchType: "all" });
    expect(evaluateFormRules(c, [allMatch]).fieldVisibility.a).toBe("show");
    const oneFails = rule([cond("status", "is", ["interested"]), cond("stage", "is", ["Old"])], [showField("a")], { matchType: "all" });
    expect(evaluateFormRules(c, [oneFails]).fieldVisibility.a).toBeUndefined();
  });

  it("any — fires when AT LEAST ONE condition matches", () => {
    const onePasses = rule([cond("status", "is", ["nope"]), cond("stage", "is", ["New"])], [showField("a")], { matchType: "any" });
    expect(evaluateFormRules(c, [onePasses]).fieldVisibility.a).toBe("show");
    const noneMatch = rule([cond("status", "is", ["nope"]), cond("stage", "is", ["Old"])], [showField("a")], { matchType: "any" });
    expect(evaluateFormRules(c, [noneMatch]).fieldVisibility.a).toBeUndefined();
  });
});

// ── hidden-wins / mandatory-wins precedence ─────────────────────────────────────
describe("precedence — hidden-wins and mandatory-wins", () => {
  const c = ctx({ status: "x" });
  const match = [cond("status", "is", ["x"])];

  it("hidden-wins: show + hide on the same field => hide, regardless of rule order", () => {
    const showThenHide = [rule(match, [showField("f")], { sortOrder: 0 }), rule(match, [hideField("f")], { sortOrder: 1 })];
    const hideThenShow = [rule(match, [hideField("f")], { sortOrder: 0 }), rule(match, [showField("f")], { sortOrder: 1 })];
    expect(evaluateFormRules(c, showThenHide).fieldVisibility.f).toBe("hide");
    expect(evaluateFormRules(c, hideThenShow).fieldVisibility.f).toBe("hide");
  });

  it("mandatory-wins: mandatory + optional on the same field => mandatory, regardless of order", () => {
    const mThenO = [rule(match, [mandatory("f")], { sortOrder: 0 }), rule(match, [optional("f")], { sortOrder: 1 })];
    const oThenM = [rule(match, [optional("f")], { sortOrder: 0 }), rule(match, [mandatory("f")], { sortOrder: 1 })];
    expect(evaluateFormRules(c, mThenO).fieldRequirement.f).toBe("mandatory");
    expect(evaluateFormRules(c, oThenM).fieldRequirement.f).toBe("mandatory");
  });

  it("show_tab accumulates as a union", () => {
    const d = evaluateFormRules(c, [rule(match, [showTab("t1"), showTab("t2")]), rule(match, [showTab("t1")])]);
    expect([...d.tabsToShow].sort()).toEqual(["t1", "t2"]);
  });
});

// ── set_stage one-hop + no cascade ──────────────────────────────────────────────
describe("set_stage — first-match-wins (one hop) and NO cascade", () => {
  it("only the first matching set_stage wins (by sortOrder)", () => {
    const c = ctx({ status: "interested" });
    const rules = [
      rule([cond("status", "is", ["interested"])], [setStage("Qualified")], { sortOrder: 0 }),
      rule([cond("status", "is", ["interested"])], [setStage("Negotiation")], { sortOrder: 1 }),
    ];
    expect(evaluateFormRules(c, rules).setStage).toEqual({ status: "Qualified", subStatus: null });
  });

  it("set_stage carries a sub-status when provided", () => {
    const c = ctx({ status: "interested" });
    expect(evaluateFormRules(c, [rule([cond("status", "is", ["interested"])], [setStage("Qualified", "AwaitingDocs")])]).setStage).toEqual({
      status: "Qualified",
      subStatus: "AwaitingDocs",
    });
  });

  it("NO cascade: a rule keyed on the would-be set stage does NOT fire from another rule's set_stage", () => {
    // Rule A sets stage Qualified; Rule B keys on status=Qualified. Input status is
    // 'interested', so B must NOT fire — it sees the INPUT context, not A's decision.
    const c = ctx({ status: "interested" });
    const rules = [
      rule([cond("status", "is", ["interested"])], [setStage("Qualified")], { sortOrder: 0 }),
      rule([cond("status", "is", ["Qualified"])], [showField("leaked")], { sortOrder: 1 }),
    ];
    const d = evaluateFormRules(c, rules);
    expect(d.setStage).toEqual({ status: "Qualified", subStatus: null });
    expect(d.fieldVisibility.leaked).toBeUndefined(); // B did not fire — no cascade
  });
});

// ── neutral / edge cases ────────────────────────────────────────────────────────
describe("neutral & edge cases", () => {
  it("no rule matches => empty neutral decision, not an error", () => {
    const d = evaluateFormRules(ctx({ status: "nope" }), [rule([cond("status", "is", ["x"])], [showField("a")])]);
    expect(d).toEqual({ fieldVisibility: {}, fieldRequirement: {}, tabsToShow: [], setStage: null });
  });

  it("empty rule set => neutral decision", () => {
    expect(evaluateFormRules(ctx({ status: "x" }), [])).toEqual({ fieldVisibility: {}, fieldRequirement: {}, tabsToShow: [], setStage: null });
  });

  it("inactive rules are skipped", () => {
    const d = evaluateFormRules(ctx({ status: "x" }), [rule([cond("status", "is", ["x"])], [showField("a")], { isActive: false })]);
    expect(d.fieldVisibility.a).toBeUndefined();
  });

  it("a rule with ZERO conditions is inert (never matches)", () => {
    expect(evaluateFormRules(ctx({ status: "x" }), [rule([], [showField("a")], { matchType: "all" })]).fieldVisibility.a).toBeUndefined();
    expect(evaluateFormRules(ctx({ status: "x" }), [rule([], [showField("a")], { matchType: "any" })]).fieldVisibility.a).toBeUndefined();
  });

  it("condition on a field with NO value: is_empty matches, is/is_any_of do not, is_not does", () => {
    const c = ctx({ fieldValues: {} }); // gstin absent
    expect(evaluateFormRules(c, [rule([cond("field", "is_empty", null, "gstin")], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(c, [rule([cond("field", "is", ["x"], "gstin")], [showField("a")])]).fieldVisibility.a).toBeUndefined();
    expect(evaluateFormRules(c, [rule([cond("field", "is_any_of", ["x"], "gstin")], [showField("a")])]).fieldVisibility.a).toBeUndefined();
    expect(evaluateFormRules(c, [rule([cond("field", "is_not", ["x"], "gstin")], [showField("a")])]).fieldVisibility.a).toBe("show");
  });

  it("multi-valued field uses set semantics (is_any_of = overlap)", () => {
    const c = ctx({ fieldValues: { owners: ["u1", "u2"] } });
    expect(evaluateFormRules(c, [rule([cond("field", "is_any_of", ["u2", "u9"], "owners")], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(c, [rule([cond("field", "is", ["u1"], "owners")], [showField("a")])]).fieldVisibility.a).toBe("show");
    expect(evaluateFormRules(c, [rule([cond("field", "is_none_of", ["u1"], "owners")], [showField("a")])]).fieldVisibility.a).toBeUndefined();
  });
});
