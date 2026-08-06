import { getLeadScoringConfig } from "@/lib/services/leads/lead-scoring/config";
import { recalculateLeadScore } from "@/lib/services/leads/lead-scoring/apply-score";

/**
 * When true, the API should omit manual score and run auto-calculation instead.
 */
export async function shouldUseAutoLeadScore(
  tenantId: string,
  hasExplicitScore: boolean,
): Promise<boolean> {
  const config = await getLeadScoringConfig(tenantId);
  if (!config.enabled || !config.autoRecalculate) return false;
  if (config.allowManualOverride && hasExplicitScore) return false;
  return true;
}

/** Recompute score and return the new value (or undefined if scoring off). */
export async function syncLeadScoreAfterChange(
  tenantId: string,
  leadId: string,
): Promise<number | undefined> {
  const result = await recalculateLeadScore(tenantId, leadId);
  return result?.score;
}
