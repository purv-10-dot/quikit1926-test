/**
 * FR-RE Unit 6a (FR-RE-5/6) — pure rule EVALUATION engine.
 *
 * Context in -> resolved Decision out. This module is PURE: no DB, no lead
 * writes, no form rendering, no Prisma import. It decides WHAT should happen and
 * returns a plain object. Applying that decision (set_stage -> lead write,
 * surfacing visibility/requirement/tabs to the form) and the Prisma-row ->
 * EvalRule adapter are Unit 6b.
 *
 * Cascade discipline (reused from FR-D3, lib/services/automation/disposition-
 * rule-engine.ts): conditions are evaluated ONLY against the INPUT context,
 * never against the engine's own decision — a stage decided by a rule does NOT
 * re-trigger evaluation (one hop, no loops). set_stage is first-match-wins via a
 * stageHopFired guard, mirroring that engine's statusHopFired.
 *
 * String comparisons are case-insensitive + trimmed (FR-D3 "Condition 1").
 */

// ── public types (decoupled from Prisma so the engine stays pure/testable) ──────

export type SubjectKind = "field" | "stage" | "status" | "sub_stage";
export type Operator =
  | "is"
  | "is_not"
  | "is_any_of"
  | "is_none_of"
  | "is_empty"
  | "is_not_empty";
export type ActionType =
  | "show_field"
  | "hide_field"
  | "make_mandatory"
  | "make_optional"
  | "show_tab"
  | "set_stage";

export interface EvalContext {
  /** The disposition field values keyed by fieldKey (scalar, multi, or absent). */
  fieldValues: Record<string, string | string[] | null | undefined>;
  stage?: string | null;
  status?: string | null;
  subStage?: string | null;
}

export interface EvalCondition {
  subjectKind: SubjectKind;
  subjectFieldKey?: string | null;
  operator: Operator;
  valueKeys?: string[] | null;
}

export interface EvalAction {
  actionType: ActionType;
  targetFieldKey?: string | null;
  targetTabId?: string | null;
  /** For set_stage: the target CONTACT STAGE name (lead.stage), applied by 6b.
   *  Named setStatusId for the (unrenamable) schema column; it carries a stage. */
  setStatusId?: string | null;
  setSubStatusId?: string | null;
  sortOrder: number;
}

export interface EvalRule {
  matchType: "all" | "any";
  isActive: boolean;
  sortOrder: number;
  conditions: EvalCondition[];
  actions: EvalAction[];
}

export interface RuleDecision {
  fieldVisibility: Record<string, "show" | "hide">;
  fieldRequirement: Record<string, "mandatory" | "optional">;
  tabsToShow: string[];
  /** set_stage decision. `status` carries the target CONTACT STAGE name
   *  (lead.stage) — the field name is legacy; 6b writes it to lead.stage. */
  setStage: { status: string; subStatus: string | null } | null;
}

// ── matching ────────────────────────────────────────────────────────────────────

/** FR-D3 Condition 1: trim + lowercase before any comparison. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Normalize a subject's current value(s) to a set of non-empty normalized strings. */
function presentValues(raw: string | string[] | null | undefined): Set<string> {
  const arr = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return new Set(arr.map((v) => norm(String(v))).filter((v) => v !== ""));
}

function subjectValues(context: EvalContext, condition: EvalCondition): Set<string> {
  switch (condition.subjectKind) {
    case "field":
      return presentValues(
        condition.subjectFieldKey ? context.fieldValues[condition.subjectFieldKey] : null,
      );
    case "stage":
      return presentValues(context.stage);
    case "status":
      return presentValues(context.status);
    case "sub_stage":
      return presentValues(context.subStage);
  }
}

function conditionMatches(context: EvalContext, condition: EvalCondition): boolean {
  const P = subjectValues(context, condition);
  const V = (condition.valueKeys ?? []).map((v) => norm(String(v))).filter((v) => v !== "");

  switch (condition.operator) {
    case "is":
      return V.length > 0 && P.has(V[0]!);
    case "is_not":
      return V.length > 0 && !P.has(V[0]!);
    case "is_any_of":
      return V.some((v) => P.has(v));
    case "is_none_of":
      return !V.some((v) => P.has(v));
    case "is_empty":
      return P.size === 0;
    case "is_not_empty":
      return P.size > 0;
  }
}

/** A rule matches when its conditions satisfy matchType. Zero conditions => inert. */
function ruleMatches(context: EvalContext, rule: EvalRule): boolean {
  if (!rule.isActive) return false;
  if (rule.conditions.length === 0) return false; // inert: a conditionless rule never fires
  const results = rule.conditions.map((c) => conditionMatches(context, c));
  return rule.matchType === "all" ? results.every(Boolean) : results.some(Boolean);
}

// ── evaluation (single pass, no cascade) ─────────────────────────────────────────

/**
 * Evaluate active rules against the input context and return a resolved decision.
 * Pure + side-effect-free. Conditions never see the decision being built, so a
 * rule-decided stage cannot re-trigger another rule (no cascade).
 */
export function evaluateFormRules(context: EvalContext, rules: EvalRule[]): RuleDecision {
  const decision: RuleDecision = {
    fieldVisibility: {},
    fieldRequirement: {},
    tabsToShow: [],
    setStage: null,
  };
  const tabs = new Set<string>();
  let stageHopFired = false;

  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const rule of ordered) {
    if (!ruleMatches(context, rule)) continue;

    const actions = [...rule.actions].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const action of actions) {
      switch (action.actionType) {
        case "show_field": {
          const key = action.targetFieldKey;
          if (key && decision.fieldVisibility[key] !== "hide") {
            decision.fieldVisibility[key] = "show"; // never override a hide (hidden-wins)
          }
          break;
        }
        case "hide_field": {
          const key = action.targetFieldKey;
          if (key) decision.fieldVisibility[key] = "hide"; // hide always wins
          break;
        }
        case "make_mandatory": {
          const key = action.targetFieldKey;
          if (key) decision.fieldRequirement[key] = "mandatory"; // mandatory always wins
          break;
        }
        case "make_optional": {
          const key = action.targetFieldKey;
          if (key && decision.fieldRequirement[key] !== "mandatory") {
            decision.fieldRequirement[key] = "optional"; // never relax a mandatory
          }
          break;
        }
        case "show_tab": {
          if (action.targetTabId) tabs.add(action.targetTabId);
          break;
        }
        case "set_stage": {
          if (!stageHopFired && action.setStatusId) {
            decision.setStage = {
              status: action.setStatusId,
              subStatus: action.setSubStatusId ?? null,
            };
            stageHopFired = true; // one hop — first matching set_stage wins
          }
          break;
        }
      }
    }
  }

  decision.tabsToShow = [...tabs];
  return decision;
}
