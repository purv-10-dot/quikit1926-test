import { prisma } from "@/lib/db/prisma";
import type { LeadScoringConfig } from "@/lib/services/leads/lead-scoring/types";
import { DEFAULT_LEAD_SCORING_CONFIG } from "@/lib/services/leads/lead-scoring/defaults";
import { configSchema } from "@/lib/services/leads/lead-scoring/schema";

export { DEFAULT_LEAD_SCORING_CONFIG } from "@/lib/services/leads/lead-scoring/defaults";

interface SettingsTree {
  leadScoring?: unknown;
  [k: string]: unknown;
}

async function readTree(orgId: string): Promise<SettingsTree> {
  const row = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { orgId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(orgId: string, next: SettingsTree): Promise<void> {
  await prisma.qcfOrgWorkspaceSettings.upsert({
    where: { orgId },
    create: { orgId, settings: next as object },
    update: { settings: next as object },
  });
}

function parseConfig(raw: unknown): LeadScoringConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_LEAD_SCORING_CONFIG };
  return parsed.data;
}

export async function getLeadScoringConfig(orgId: string): Promise<LeadScoringConfig> {
  const tree = await readTree(orgId);
  return parseConfig(tree.leadScoring ?? DEFAULT_LEAD_SCORING_CONFIG);
}

export async function setLeadScoringConfig(
  orgId: string,
  patch: Partial<LeadScoringConfig>,
): Promise<LeadScoringConfig> {
  const tree = await readTree(orgId);
  const current = await getLeadScoringConfig(orgId);
  const merged: LeadScoringConfig = {
    enabled: patch.enabled ?? current.enabled,
    autoRecalculate: patch.autoRecalculate ?? current.autoRecalculate,
    allowManualOverride: patch.allowManualOverride ?? current.allowManualOverride,
    rules: patch.rules ?? current.rules,
    behavior: patch.behavior ?? current.behavior,
  };
  const validated = parseConfig(merged);
  await writeTree(orgId, { ...tree, leadScoring: validated });
  return validated;
}

export { configSchema } from "@/lib/services/leads/lead-scoring/schema";
