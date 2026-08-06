/**
 * [P3.S1] Automation publish lifecycle — the single source of truth for
 * `CrmWorkflowDefinition` state.  SPEC §7.
 *
 * Both Phase 3 tracks call THIS module and nothing else for lifecycle state:
 *   - Track A (builder UI) — publish / unpublish / soft-delete controls (A5),
 *     and `canEditStructure()` to lock the canvas after publish.
 *   - Track B (engine/lifecycle) — Immediate/Delayed unpublish, structure
 *     immutability, and the publish-time loop check hooks `publish()` (B4).
 * Encoding the state machine once (here) is why the shared foundation lands
 * before the A/B split — see the build plan §4 "the conflict, precisely".
 *
 * State machine (status column on CrmWorkflowDefinition; enum extended
 * additively in S1 — Draft/Active/Paused/Archived pre-existed):
 *
 *   Draft ──publish──▶ Active ──unpublish(delayed)──▶ Draining
 *                        │  └────unpublish(immediate)─▶ Stopped
 *                        │
 *   (Draft/Active/Stopped/Paused/Archived) ──softDelete──▶ Deleted ──restore──▶ Draft
 *
 *   Draining is deliberately NOT delete-able (in-flight leads are still
 *   finishing) — stop it Immediate first. `deletedAt` is set on soft-delete
 *   and cleared on restore; the row is never hard-deleted (SPEC §7).
 *
 * Firing gates (canAdmitNewLead / canResumeInFlight) are exported so the engine
 * and the trigger emitter share ONE definition of "what fires" — the engine's
 * existing status:"Active" filter is replaced by these.  All writes/reads are
 * tenant-scoped (Constraint 1.4).
 */
import { prisma } from "@/lib/db/prisma";
import type { CrmWorkflowStatus, CrmWorkflowDefinition } from "@quikit/database";
import { detectPublishLoop } from "@/lib/services/automation/loop-detect";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/types/workflow";

/** Thrown on an illegal transition or a missing/foreign-tenant workflow. */
export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

/** Unpublish semantics (SPEC §7):
 *   immediate → Stopped  (halts in-flight leads at once)
 *   delayed   → Draining (admits no new leads; in-flight leads finish) */
export type UnpublishMode = "immediate" | "delayed";

// ── Firing gates — the single source of truth for "what fires" ──────────────

/** The only status a NEW lead may enter. Draining admits nothing new; that is
 *  the whole point of Delayed unpublish. Used by the trigger emitter. */
export const ADMIT_NEW_STATUS: CrmWorkflowStatus = "Active";

/** New leads may ONLY enter an Active automation. */
export function canAdmitNewLead(status: CrmWorkflowStatus): boolean {
  return status === "Active";
}

/** In-flight (mid-Wait) leads still resume under Active OR Draining — a Drain
 *  lets already-entered leads finish. Stopped/Deleted/Draft never resume. */
export function canResumeInFlight(status: CrmWorkflowStatus): boolean {
  return status === "Active" || status === "Draining";
}

/** Structure (add/remove nodes) is editable only in Draft. Once published the
 *  canvas locks; content-only Live Edit is a separate allowance (Track A A1/A3).
 *  Backs both A's canvas-lock and B's immutability enforcement. SPEC §7. */
export function canEditStructure(status: CrmWorkflowStatus): boolean {
  return status === "Draft";
}

// ── Transition rules ────────────────────────────────────────────────────────

const PUBLISH_FROM: CrmWorkflowStatus[] = ["Draft"];
const UNPUBLISH_FROM: CrmWorkflowStatus[] = ["Active"];
// Draining is intentionally excluded — see softDelete(). Deleted excluded (already gone).
const DELETE_FROM: CrmWorkflowStatus[] = ["Draft", "Active", "Stopped", "Paused", "Archived"];

function assertFrom(current: CrmWorkflowStatus, allowed: CrmWorkflowStatus[], op: string): void {
  if (!allowed.includes(current)) {
    throw new LifecycleError(`Cannot ${op} an automation in status "${current}" (allowed from: ${allowed.join(", ")}).`);
  }
}

/** Tenant-scoped load. Excludes soft-deleted rows unless `includeDeleted`. */
async function loadDef(
  tenantId: string,
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<CrmWorkflowDefinition> {
  const def = await prisma.crmWorkflowDefinition.findFirst({
    where: { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
  });
  if (!def) throw new LifecycleError(`Workflow "${id}" not found for this tenant.`);
  return def;
}

// ── Lifecycle operations (each tenant-scoped, each a single service call) ────

/** Draft → Active. Stamps `lastPublishedOn`. Runs the B4 publish-time loop check
 *  first — a self-looping definition is rejected here (LifecycleError) so the
 *  block surfaces uniformly to every caller (Track A's Publish button and any
 *  lifecycle route both call THIS function). SPEC §6, §7. */
export async function publish(tenantId: string, id: string): Promise<CrmWorkflowDefinition> {
  const def = await loadDef(tenantId, id);
  assertFrom(def.status, PUBLISH_FROM, "publish");

  // [P3.B4] Pre-save static loop check (conservative — the P2.1 runtime cap is
  // the real backstop). Blocks publishing a definition whose own action would
  // re-fire its own "lead updated" trigger.
  const graph: WorkflowGraph = {
    nodes: (def.graphNodes as unknown as WorkflowNode[]) ?? [],
    edges: (def.graphEdges as unknown as WorkflowEdge[]) ?? [],
  };
  const finding = detectPublishLoop(graph, def.triggerType);
  if (finding.loops) throw new LifecycleError(finding.reason ?? "Publishing would create a loop.");

  return prisma.crmWorkflowDefinition.update({
    where: { id: def.id }, // tenant ownership already asserted by loadDef
    data: { status: "Active", lastPublishedOn: new Date() },
  });
}

/** Active → Stopped (immediate) or Active → Draining (delayed). */
export async function unpublish(
  tenantId: string,
  id: string,
  mode: UnpublishMode,
): Promise<CrmWorkflowDefinition> {
  const def = await loadDef(tenantId, id);
  assertFrom(def.status, UNPUBLISH_FROM, "unpublish");
  const status: CrmWorkflowStatus = mode === "immediate" ? "Stopped" : "Draining";
  return prisma.crmWorkflowDefinition.update({ where: { id: def.id }, data: { status } });
}

/** Soft-delete → Deleted + `deletedAt`. Recoverable via restore(). Never a hard
 *  delete (SPEC §7). Rejected while Draining — the automation is still draining
 *  in-flight leads and must be Stopped (Immediate) first. */
export async function softDelete(tenantId: string, id: string): Promise<CrmWorkflowDefinition> {
  const def = await loadDef(tenantId, id);
  if (def.status === "Draining") {
    throw new LifecycleError(
      "Cannot delete a Draining automation until it has drained — unpublish it Immediately (Stopped) first.",
    );
  }
  assertFrom(def.status, DELETE_FROM, "delete");
  return prisma.crmWorkflowDefinition.update({
    where: { id: def.id },
    data: { status: "Deleted", deletedAt: new Date() },
  });
}

/** Deleted → Draft. Clears `deletedAt`. Restores as an inert Draft (re-publish
 *  is an explicit subsequent action). */
export async function restore(tenantId: string, id: string): Promise<CrmWorkflowDefinition> {
  const def = await loadDef(tenantId, id, { includeDeleted: true });
  if (def.status !== "Deleted") {
    throw new LifecycleError("Only a soft-deleted automation can be restored.");
  }
  return prisma.crmWorkflowDefinition.update({
    where: { id: def.id },
    data: { status: "Draft", deletedAt: null },
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Tenant-scoped list. Excludes soft-deleted rows by default (the "active list"
 *  the builder grid shows); pass includeDeleted for a trash view. */
export async function listAutomations(
  tenantId: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<CrmWorkflowDefinition[]> {
  return prisma.crmWorkflowDefinition.findMany({
    where: { tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
    orderBy: { updatedAt: "desc" },
  });
}

/** True when a Draining automation has no leads still in-flight (no pending or
 *  processing steps). Backs A5's "non-deletable until drained" affordance and a
 *  future drain-completion sweep. Tenant-scoped. */
export async function isDrained(tenantId: string, id: string): Promise<boolean> {
  const outstanding = await prisma.crmAutomationPendingStep.count({
    where: { tenantId, workflowId: id, status: { in: ["pending", "processing"] } },
  });
  return outstanding === 0;
}
