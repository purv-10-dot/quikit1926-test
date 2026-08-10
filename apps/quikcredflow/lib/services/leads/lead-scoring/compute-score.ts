import type {
  LeadScoringBreakdown,
  LeadScoringConfig,
  LeadScoringContext,
  LeadScoringLeadInput,
  LeadScoringOperator,
  LeadScoringRule,
} from "@/lib/services/leads/lead-scoring/types";
export type { LeadScoringLeadInput } from "@/lib/services/leads/lead-scoring/types";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function norm(s: unknown): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function getLeadFieldValue(lead: LeadScoringLeadInput, field: string): unknown {
  if (field.startsWith("dynamicFields.")) {
    const key = field.slice("dynamicFields.".length);
    const dyn = lead.dynamicFields ?? {};
    return dyn[key];
  }
  return (lead as unknown as Record<string, unknown>)[field];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

function ruleValueList(value: LeadScoringRule["value"]): string[] {
  if (Array.isArray(value)) return value.map((x) => norm(x));
  if (value == null) return [];
  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map((s) => norm(s.trim()));
  }
  return [norm(value)];
}

export function evaluateLeadScoringRule(
  rule: LeadScoringRule,
  lead: LeadScoringLeadInput,
): boolean {
  if (!rule.enabled) return false;
  const raw = getLeadFieldValue(lead, rule.field);
  const op = rule.operator;

  if (op === "is_empty") return isEmpty(raw);
  if (op === "is_not_empty") return !isEmpty(raw);
  if (op === "is_true") return toBool(raw) === true;
  if (op === "is_false") return toBool(raw) === false;

  const fieldStr = norm(raw);
  const ruleVals = ruleValueList(rule.value);

  switch (op) {
    case "equals":
      return fieldStr === norm(rule.value);
    case "not_equals":
      return fieldStr !== norm(rule.value);
    case "contains":
      return fieldStr.includes(norm(rule.value));
    case "not_contains":
      return !fieldStr.includes(norm(rule.value));
    case "in":
      return ruleVals.length > 0 && ruleVals.includes(fieldStr);
    case "not_in":
      return ruleVals.length > 0 && !ruleVals.includes(fieldStr);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(raw);
      const b = toNumber(rule.value);
      if (a == null || b == null) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

/** Profile completeness — how well we know the lead. */
export function computeFitPoints(lead: LeadScoringLeadInput): number {
  let pts = 0;
  if (!isEmpty(lead.email)) pts += 8;
  if (!isEmpty(lead.phone) || !isEmpty(lead.mobile)) pts += 8;
  if (!isEmpty(lead.company)) pts += 12;
  if (!isEmpty(lead.jobTitle)) pts += 6;
  if (!isEmpty(lead.industry)) pts += 8;
  if (!isEmpty(lead.website) || !isEmpty(lead.linkedinUrl)) pts += 5;
  if (!isEmpty(lead.country)) pts += 4;
  if (lead.isStarred) pts += 5;
  return Math.min(40, pts);
}

/** Engagement from CRM activity signals. */
export function computeEngagementPoints(
  lead: LeadScoringLeadInput,
  ctx: LeadScoringContext,
): number {
  let pts = Math.min(
    45,
    ctx.activitiesCount * 6 + ctx.callsCount * 10 + ctx.notesCount * 4,
  );
  if (ctx.lastTouchHours != null && ctx.lastTouchHours < 48) pts += 12;
  if (ctx.lastTouchHours != null && ctx.lastTouchHours > 14 * 24) pts -= 20;
  if (ctx.openTasks > 0) pts += 5;
  if (lead.isDisengaged) pts -= 15;

  const stage = lead.stage.toLowerCase();
  if (stage.includes("qualified")) pts += 10;
  if (stage.includes("proposal")) pts += 15;
  if (stage.includes("negotiation")) pts += 20;
  if (stage.includes("won") || stage.includes("converted")) pts += 25;
  if (stage.includes("lost") || stage.includes("disqual")) pts -= 30;

  const status = lead.status.toLowerCase();
  if (status.includes("working")) pts += 5;

  return clamp(pts, 0, 50);
}

export function computeLeadScore(
  lead: LeadScoringLeadInput,
  ctx: LeadScoringContext,
  config: LeadScoringConfig,
): LeadScoringBreakdown {
  if (!config.enabled) {
    return {
      fitPoints: 0,
      engagementPoints: 0,
      rulePoints: 0,
      matchedRules: [],
      total: 0,
    };
  }

  let fitPoints = 0;
  let engagementPoints = 0;
  if (config.behavior.enabled) {
    fitPoints = computeFitPoints(lead);
    engagementPoints = computeEngagementPoints(lead, ctx);
    const baselineCap = config.behavior.maxBaselinePoints;
    const baselineSum = fitPoints + engagementPoints;
    if (baselineSum > baselineCap) {
      const scale = baselineCap / baselineSum;
      fitPoints = Math.round(fitPoints * scale);
      engagementPoints = Math.round(engagementPoints * scale);
    }
  }

  let rulePoints = 0;
  const matchedRules: LeadScoringBreakdown["matchedRules"] = [];
  for (const rule of config.rules) {
    if (!evaluateLeadScoringRule(rule, lead)) continue;
    rulePoints += rule.points;
    matchedRules.push({
      id: rule.id,
      label: rule.label ?? `${rule.field} ${rule.operator}`,
      points: rule.points,
    });
  }

  const total = clamp(fitPoints + engagementPoints + rulePoints, 0, 100);
  return { fitPoints, engagementPoints, rulePoints, matchedRules, total };
}

export function operatorsNeedValue(op: LeadScoringOperator): boolean {
  return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(op);
}
