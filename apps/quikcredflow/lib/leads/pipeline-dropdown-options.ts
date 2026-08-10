import type { DependentRules } from "@/lib/services/workspace/pipeline-config";

function lookupRule<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  if (!map) return undefined;
  if (map[key] !== undefined) return map[key];
  const match = Object.keys(map).find((k) => k.toLowerCase() === key.toLowerCase());
  return match ? map[match] : undefined;
}

/** Stages shown in the lead form Stage dropdown (empty rule = all stages). */
export function visibleStagesForSource(
  allStages: string[],
  rules: DependentRules,
  source: string,
): string[] {
  const allowed = lookupRule(rules.sourceToStages, source.trim());
  if (!allowed || allowed.length === 0) return allStages;
  return allStages.filter((s) => allowed.includes(s));
}

/** Statuses shown in the lead form Status dropdown (empty rule = all statuses). */
export function visibleStatusesForStage(
  allStatuses: string[],
  rules: DependentRules,
  stage: string,
): string[] {
  const allowed = lookupRule(rules.stageToStatuses, stage);
  if (!allowed || allowed.length === 0) return allStatuses;
  return allStatuses.filter((s) => allowed.includes(s));
}

export function isStageListRestrictedBySource(
  allStages: string[],
  rules: DependentRules,
  source: string,
): boolean {
  const visible = visibleStagesForSource(allStages, rules, source);
  return visible.length < allStages.length;
}

export function isStatusListRestrictedByStage(
  allStatuses: string[],
  rules: DependentRules,
  stage: string,
): boolean {
  const visible = visibleStatusesForStage(allStatuses, rules, stage);
  return visible.length < allStatuses.length;
}
