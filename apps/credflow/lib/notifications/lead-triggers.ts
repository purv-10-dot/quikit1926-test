/**
 * Lead notification triggers — Phase 1.
 *
 * These functions encapsulate all the business logic for WHEN and WHO to notify
 * on lead lifecycle events. Route handlers call them fire-and-forget; they
 * never block the API response.
 *
 * Business rules:
 *   - Lead Assigned    → notify the NEW owner (skip if actor = new owner).
 *   - Lead Reassigned  → notify the OLD owner (skip if actor = old owner).
 *   - Lead Stage Changed → notify the lead owner (skip if actor = owner).
 *   - Lead Converted   → notify the lead owner (skip if actor = owner).
 *
 * All four are called from the lead route handlers after a successful DB write.
 * They are exported as thin wrappers that accept only the scalar data already
 * available in the route — no extra DB reads required by the caller.
 */

import { createNotification } from "./service";

// ─── Lead Assigned ────────────────────────────────────────────────────────────

export interface LeadAssignedParams {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  leadId: string;
  leadName: string;
  newOwnerId: string;
}

/**
 * Fired when a lead is assigned to a new owner for the first time (no previous
 * owner) OR re-assigned and we want to alert the incoming owner.
 * Skip notification when the actor IS the new owner (self-assignment).
 */
export async function notifyLeadAssigned(
  params: LeadAssignedParams,
): Promise<void> {
  const { tenantId, actorUserId, actorName, leadId, leadName, newOwnerId } =
    params;

  // Self-assignment — no notification needed.
  if (newOwnerId === actorUserId) return;

  await createNotification({
    tenantId,
    userId: newOwnerId,
    type: "lead_assigned",
    category: "lead",
    title: "Lead assigned to you",
    body: `"${leadName}" was assigned to you by ${actorName}.`,
    link: `/leads/${leadId}`,
    metadata: { leadId, leadName, assignedByName: actorName },
  });
}

// ─── Lead Reassigned (old owner notification) ─────────────────────────────────

export interface LeadReassignedParams {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  leadId: string;
  leadName: string;
  oldOwnerId: string;
  newOwnerName: string;
}

/**
 * Fired alongside notifyLeadAssigned when a lead is taken FROM an existing
 * owner. The old owner receives a "your lead was reassigned" notification.
 * Skip when the actor IS the old owner (they reassigned it themselves).
 */
export async function notifyLeadReassigned(
  params: LeadReassignedParams,
): Promise<void> {
  const {
    tenantId,
    actorUserId,
    actorName,
    leadId,
    leadName,
    oldOwnerId,
    newOwnerName,
  } = params;

  // Actor is the old owner — they knowingly reassigned; don't notify.
  if (oldOwnerId === actorUserId) return;

  await createNotification({
    tenantId,
    userId: oldOwnerId,
    type: "lead_reassigned",
    category: "lead",
    title: "Lead reassigned",
    body: `"${leadName}" was reassigned to ${newOwnerName} by ${actorName}.`,
    link: `/leads/${leadId}`,
    metadata: { leadId, leadName, newOwnerName, assignedByName: actorName },
  });
}

// ─── Orchestrator: handle owner change on PATCH ───────────────────────────────

export interface LeadOwnerChangeParams {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  leadId: string;
  leadName: string;
  oldOwnerId: string | null;
  newOwnerId: string | null;
  newOwnerName: string | null;
}

/**
 * Single call from the lead PATCH route. Decides which combination of
 * notifyLeadAssigned / notifyLeadReassigned to fire.
 *
 * Cases:
 *   old = null, new = X  → first assignment (assigned only)
 *   old = X, new = Y     → reassignment  (assigned to Y + reassigned from X)
 *   old = X, new = null  → owner cleared (no notification)
 *   old = X, new = X     → no change     (no-op)
 */
export async function fireLeadOwnerChangeNotifications(
  params: LeadOwnerChangeParams,
): Promise<void> {
  const { oldOwnerId, newOwnerId } = params;

  // No meaningful change.
  if (!newOwnerId || newOwnerId === oldOwnerId) return;

  // Notify the incoming owner.
  await notifyLeadAssigned({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    leadId: params.leadId,
    leadName: params.leadName,
    newOwnerId,
  });

  // Notify the outgoing owner (if there was one).
  if (oldOwnerId) {
    await notifyLeadReassigned({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      leadId: params.leadId,
      leadName: params.leadName,
      oldOwnerId,
      newOwnerName: params.newOwnerName ?? newOwnerId,
    });
  }
}

// ─── Lead Stage Changed ───────────────────────────────────────────────────────

export interface LeadStageChangedParams {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  leadId: string;
  leadName: string;
  ownerId: string | null;
  fromStage: string;
  toStage: string;
}

/**
 * Fired after a successful stage transition. Notifies the lead owner.
 * Skip when the actor IS the owner (they transitioned it themselves).
 */
export async function notifyLeadStageChanged(
  params: LeadStageChangedParams,
): Promise<void> {
  const {
    tenantId,
    actorUserId,
    actorName,
    leadId,
    leadName,
    ownerId,
    fromStage,
    toStage,
  } = params;

  // No owner to notify.
  if (!ownerId) return;
  // Actor is the owner — they know what they did.
  if (ownerId === actorUserId) return;

  await createNotification({
    tenantId,
    userId: ownerId,
    type: "lead_stage_changed",
    category: "lead",
    title: "Lead stage updated",
    body: `"${leadName}" moved from ${fromStage} to ${toStage} by ${actorName}.`,
    link: `/leads/${leadId}`,
    metadata: { leadId, leadName, fromStage, toStage, actorName },
  });
}

// ─── Lead Converted ───────────────────────────────────────────────────────────

export interface LeadConvertedParams {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  leadId: string;
  leadName: string;
  ownerId: string | null;
  contactId: string | null;
  opportunityId: string | null;
}

/**
 * Fired after a successful lead conversion. Notifies the lead owner.
 * Skip when the actor IS the owner.
 */
export async function notifyLeadConverted(
  params: LeadConvertedParams,
): Promise<void> {
  const {
    tenantId,
    actorUserId,
    actorName,
    leadId,
    leadName,
    ownerId,
    contactId,
    opportunityId,
  } = params;

  if (!ownerId) return;
  if (ownerId === actorUserId) return;

  const created: string[] = [];
  if (contactId) created.push("contact");
  if (opportunityId) created.push("opportunity");
  const createdSuffix =
    created.length > 0
      ? ` A ${created.join(" and ")} was created.`
      : "";

  await createNotification({
    tenantId,
    userId: ownerId,
    type: "lead_converted",
    category: "lead",
    title: "Lead converted",
    body: `"${leadName}" was converted by ${actorName}.${createdSuffix}`,
    link: `/leads/${leadId}`,
    metadata: {
      leadId,
      leadName,
      convertedByName: actorName,
      contactId,
      opportunityId,
    },
  });
}
