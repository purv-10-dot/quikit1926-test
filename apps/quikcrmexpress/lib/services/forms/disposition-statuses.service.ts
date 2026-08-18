/**
 * FR-RE Stage 1 — the ONE canonical disposition-status source.
 *
 * Thin wrapper over the existing pipeline-config (getPipelineConfig +
 * allowedStatusesForStage). No new status store — this just routes the
 * rule-builder (all statuses) and the agent form (stage-filtered) through a
 * single source so they can never disagree (the reconciliation invariant:
 * the stage-filtered set is always a subset of the full set).
 *
 * getDispositionStatuses(tenant)        -> all configured statuses (rule-builder)
 * getDispositionStatuses(tenant, stage) -> the stage-valid subset (agent form),
 *                                          falling back to ALL for an unmapped
 *                                          stage so the dropdown is never empty.
 */
import {
  getPipelineConfig,
  setPipelineConfig,
  allowedStatusesForStage,
} from "@/lib/services/workspace/pipeline-config";

/**
 * PLACEHOLDER stage->status mapping, migrated verbatim from the legacy
 * STAGE_STATUS_OPTIONS (call-disposition-modal). This is config, not code:
 * CrmExpress's authoritative mapping must be confirmed with Dev and written into
 * pipeline-config before production (swapping it is zero code change). The seed
 * below is non-clobbering, so once a real mapping is present it is respected.
 * See docs/fr-re-followups.md.
 */
export const DISPOSITION_STAGE_STATUS_SEED: Record<string, string[]> = {
  "new lead": ["Could Not Connect", "Discussion Pending (Answered Calls)", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "not connected (new lead)": ["Could Not Connect", "Discussion Pending (Answered Calls)", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "discussion pending": ["Could Not Connect", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "demo scheduled": ["Could Not Connect", "Demo Completed", "Payment Link Sent", "Not Interested", "Future Lead"],
  "demo done - demo data": ["Could Not Connect", "Interested Followup", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "demo done - sync data": ["Could Not Connect", "Interested Followup", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "interested followup": ["Could Not Connect", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "payment link sent": ["Could Not Connect", "Not Interested", "Future Lead", "Payment Done"],
};

/**
 * The configured disposition statuses for a tenant. With a stage, returns the
 * stage-valid subset (case-insensitive match against the stage->status mapping),
 * falling back to ALL configured statuses when the stage has no mapping.
 */
export async function getDispositionStatuses(
  orgId: string,
  stage?: string | null,
): Promise<string[]> {
  const cfg = await getPipelineConfig(orgId);
  const all = cfg.statuses;
  if (!stage || !stage.trim()) return all;

  const map = cfg.dependentRules.stageToStatuses ?? {};
  // Case-insensitive stage lookup: resolve the actual key, then read it.
  const key = Object.keys(map).find((k) => k.toLowerCase() === stage.trim().toLowerCase());
  const forStage = key ? allowedStatusesForStage(cfg.dependentRules, key) : [];

  // Unmapped (or empty) stage -> fall back to ALL so the dropdown is never empty.
  return forStage.length > 0 ? forStage : all;
}

/**
 * Seed the PLACEHOLDER stage->status mapping into pipeline-config — but only
 * when no mapping exists yet. Never clobbers a real mapping plugged in later.
 */
export async function seedDispositionStageStatuses(orgId: string): Promise<void> {
  const cfg = await getPipelineConfig(orgId);
  const existing = cfg.dependentRules.stageToStatuses ?? {};
  if (Object.keys(existing).length > 0) return; // real mapping present -> respect it

  await setPipelineConfig(orgId, {
    dependentRules: {
      ...cfg.dependentRules,
      stageToStatuses: DISPOSITION_STAGE_STATUS_SEED,
    },
  });
}
