import { recalculateLeadScore } from "@/lib/services/leads/lead-scoring/apply-score";

/**
 * Fire-and-forget score recalculation after lead/activity changes.
 */
export function scheduleLeadScoreRecalc(tenantId: string, leadId: string): void {
  void recalculateLeadScore(tenantId, leadId).catch((err: unknown) => {
    console.error("[lead-scoring] recalculate failed", { tenantId, leadId, err });
  });
}
