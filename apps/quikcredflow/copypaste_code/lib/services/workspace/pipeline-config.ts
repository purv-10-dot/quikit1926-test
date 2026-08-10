/**
 * Read/write the lead pipeline config (stages, statuses, dependent rules)
 * stored on OrgWorkspaceSettings.settings.leadPipelineConfig.
 *
 * Shape:
 *   {
 *     stages: string[],
 *     statuses: string[],
 *     dependentRules: {
 *       // Allowed stages for a given source. Missing source = no restriction.
 *       sourceToStages?: Record<string, string[]>,
 *       // Allowed statuses for a given stage. Missing stage = no restriction.
 *       stageToStatuses?: Record<string, string[]>,
 *     }
 *   }
 */

import { prisma } from "@/lib/db/prisma";

export const DEFAULT_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];
export const DEFAULT_STATUSES = ["Open", "Working", "Disqualified", "Converted"];

export interface DependentRules {
  sourceToStages?: Record<string, string[]>;
  stageToStatuses?: Record<string, string[]>;
}

export interface PipelineConfig {
  stages: string[];
  statuses: string[];
  dependentRules: DependentRules;
}

interface SettingsTree {
  leadPipelineConfig?: Partial<PipelineConfig>;
  [k: string]: unknown;
}

async function readTree(tenantId: string): Promise<SettingsTree> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(tenantId: string, next: SettingsTree): Promise<void> {
  await prisma.crmOrgWorkspaceSettings.upsert({
    where: { tenantId },
    create: { tenantId, settings: next as object },
    update: { settings: next as object },
  });
}

export async function getPipelineConfig(tenantId: string): Promise<PipelineConfig> {
  const tree = await readTree(tenantId);
  const cfg = tree.leadPipelineConfig ?? {};
  return {
    stages: Array.isArray(cfg.stages) && cfg.stages.length > 0 ? cfg.stages : DEFAULT_STAGES,
    statuses: Array.isArray(cfg.statuses) && cfg.statuses.length > 0 ? cfg.statuses : DEFAULT_STATUSES,
    dependentRules: cfg.dependentRules ?? {},
  };
}

export async function setPipelineConfig(tenantId: string, patch: Partial<PipelineConfig>): Promise<PipelineConfig> {
  const tree = await readTree(tenantId);
  const current = await getPipelineConfig(tenantId);
  const merged: PipelineConfig = {
    stages: patch.stages ?? current.stages,
    statuses: patch.statuses ?? current.statuses,
    dependentRules: patch.dependentRules ?? current.dependentRules,
  };
  await writeTree(tenantId, { ...tree, leadPipelineConfig: merged });
  return merged;
}

/**
 * Returns the allowed stages for a given source. Empty array means "all stages".
 * Used by the create-lead validator to enforce dependent rules.
 */
export function allowedStagesForSource(rules: DependentRules, source: string | null | undefined): string[] {
  if (!source) return [];
  return rules.sourceToStages?.[source] ?? [];
}

export function allowedStatusesForStage(rules: DependentRules, stage: string | null | undefined): string[] {
  if (!stage) return [];
  return rules.stageToStatuses?.[stage] ?? [];
}
