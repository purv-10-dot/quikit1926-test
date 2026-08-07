import { recalculateLeadScore } from "@/lib/services/leads/lead-scoring/apply-score";

/**
 * Fire-and-forget score recalculation after lead/activity changes.
 */
export function scheduleLeadScoreRecalc(orgId: string, leadId: string): void {
  void recalculateLeadScore(orgId, leadId).catch((err: unknown) => {
    console.error("[lead-scoring] recalculate failed", { orgId, leadId, err });
  });
}
