/**
 * [P3.S2] Shared automated-write helper — the ONE implementation of the
 * Constraint 1.3 write contract (SPEC §5.3).
 *
 * Every automated lead field write, from ANY node in EITHER track, goes through
 * `applyAutomatedLeadWrite`:
 *   - Change-conditional: setting a field to its current value is a no-op (no
 *     guard, no write, no emit) — relies on this behaviour, does not special-case.
 *   - Loop guard (SPEC §6): counts the write toward the per-lead/day cap; if the
 *     lead is now Terminated the write is skipped and the run stops.
 *   - Stage → transition-service (`transitionLead`), NEVER a raw crmLead.update
 *     (audit/notifications/cascade; emits triggerOutboundSync internally, once).
 *   - Status / substatus / non-pipeline field (incl. ownerId) → the PATCH/save
 *     path (`updateCrmLead`), which also emits triggerOutboundSync internally,
 *     once. The helper deliberately never calls triggerOutboundSync itself — a
 *     direct call would double-emit.
 *   - Attribution (SPEC §8): records engine source / automation / node / trigger
 *     event / before→after / trigger-time snapshot.
 *
 * This was extracted verbatim from workflow-engine.ts's `update_lead_field`
 * case (no behaviour change). It is the single write path Track B's
 * `distribute_lead` rewire (B3) will call for the owner-change write, so the 1.3
 * contract has exactly one implementation. No new raw lead-write path may be
 * introduced by either track.
 */
import type { Prisma } from "@quikit/database";
import type { QcfLead as Lead } from "@prisma/client";
import { recordWriteAndCheck, type EngineSource } from "@/lib/services/automation/loop-guard";
import { recordAttribution } from "@/lib/services/automation/attribution";
import { transitionLead } from "@/lib/services/leads/transition-service";
import { updateCrmLead } from "@/lib/services/leads/create-record";
import type { SessionUser } from "@/types/permission";

/**
 * Stable actor id stamped on every automation-engine lead write. It flows into
 * the transition/PATCH audit trail (recordLeadChange.userId) so a write can be
 * told apart from a human edit. Phase 2 attribution keys engine-source off this.
 */
export const AUTOMATION_ACTOR_ID = "automation-engine";

/** Synthetic session actor for service-layer writes made by the engine.
 *  transition-service / updateCrmLead only read `tenantId` and `userId`. */
export function automationActor(tenantId: string): SessionUser {
  return {
    userId: AUTOMATION_ACTOR_ID,
    tenantId,
    role: "system",
    email: "automation@credflow.local",
    name: "Automation Engine",
  };
}

/** Outcome of an automated write, so the caller can decide the next node.
 *  `terminated` means the loop cap was hit and the run must stop. */
export type AutomatedWriteOutcome = "noop" | "written" | "terminated";

export interface AutomatedWriteInput {
  tenantId: string;
  /** The in-memory lead. On a successful write it is mutated so any downstream
   *  node in the same run sees the new value (matches the original engine). */
  lead: Lead;
  field: string;
  value: string | null;
  workflowId: string;
  nodeId: string;
  triggerEventId: string;
  triggerType: string | null;
  snapshot: Record<string, unknown>;
  /** Discriminates automation vs legacy-disposition for the loop counter +
   *  attribution. Defaults to "automation". */
  engineSource?: EngineSource;
}

/**
 * Apply one automated lead-field write per the 1.3 contract. Returns the outcome
 * so the caller controls flow (a "terminated" run advances to a null next node).
 */
export async function applyAutomatedLeadWrite(input: AutomatedWriteInput): Promise<AutomatedWriteOutcome> {
  const { tenantId, lead, field, workflowId, nodeId, triggerEventId, triggerType, snapshot } = input;
  const value = input.value ?? null;
  const engineSource: EngineSource = input.engineSource ?? "automation";
  const current = (lead as unknown as Record<string, unknown>)[field] ?? null;

  // Change-conditional: setting a field to its current value is a no-op — do NOT
  // write and do NOT emit outbound sync. Short-circuiting here also means a
  // from==to stage target never produces a spurious "stage changed from==to"
  // notification. Relies on (does not reimplement) transition-service's own
  // change-conditional behavior. SPEC §5.3.
  if (current === value) return "noop";

  // Loop guard (SPEC §6): count this write toward the per-lead/day cap. If the
  // lead is now Terminated, do NOT write and stop the run — this is what stops a
  // runaway/self-referential rule from churning the lead.
  const guard = await recordWriteAndCheck({ tenantId, leadId: lead.id, source: engineSource });
  if (guard.terminated) {
    console.warn("[automated-write] loop cap reached — lead terminated, write skipped", {
      leadId: lead.id,
      count: guard.count,
      cap: guard.cap,
    });
    return "terminated";
  }

  if (field === "stage") {
    // Stage changes MUST route through transition-service — never a raw
    // crmLead.update. Fires audit + notifications + pipeline-cascade validation,
    // and emits the outbound LeadSquared sync internally exactly once.
    if (value == null) return "noop";
    await transitionLead({
      user: automationActor(tenantId),
      leadId: lead.id,
      input: { stage: String(value) },
    });
  } else {
    // status / substatus / non-pipeline fields route through the PATCH/save path
    // (updateCrmLead = the B1 split), which emits triggerOutboundSync internally
    // — again exactly once. Deliberately no extra triggerOutboundSync here.
    await updateCrmLead(lead.id, {
      [field]: value,
    } as unknown as Prisma.QcfLeadUncheckedUpdateInput);
  }

  // Attribution (SPEC §8): record which automation/node made this write, the
  // trigger event, before→after, and the trigger-time snapshot.
  await recordAttribution({
    tenantId,
    leadId: lead.id,
    engineSource,
    workflowId,
    nodeId,
    triggerEventId,
    triggerType,
    field,
    before: current,
    after: value,
    snapshot,
  });

  // Keep the in-memory lead consistent for any downstream node this run.
  (lead as unknown as Record<string, unknown>)[field] = value;
  return "written";
}
