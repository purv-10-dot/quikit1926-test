/**
 * Opportunity notification triggers — immediate events.
 *
 * Runs AFTER the transition service and rules engine. Never touches existing
 * lead or task notifications.
 *
 * ─── Events ──────────────────────────────────────────────────────────────────
 *
 *  notifyOpportunityCreated()      → Owner + Sales Managers
 *  notifyOpportunityStageChanged() → Owner only (suppress if actor = owner)
 *  notifyOpportunityWon()          → Owner + ALL Sales Managers  🎉
 *  notifyOpportunityLost()         → Owner + Sales Managers
 *
 * ─── Won celebration ─────────────────────────────────────────────────────────
 *  notifyOpportunityWon() sends a 🎉 celebration notification that includes
 *  the formatted deal value (INR-aware: ₹ K / L / Cr notation).
 *  Sales managers are included even if they are the actor — winning a deal
 *  is worth the noise.
 */

import { prisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/notifications/service";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getSalesManagers(
  tenantId: string,
  excludeUserId: string,
): Promise<string[]> {
  const members = await prisma.orgMember.findMany({
    where: {
      orgId: tenantId,
      status: "active",
      role: {
        in: [
          "SalesManager", "Administrator",
          "manager", "admin", "org_admin",
        ],
      },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId).filter((id) => id !== excludeUserId);
}

/**
 * Format an opportunity amount for display in notifications.
 * Handles INR (₹ K / L / Cr) and generic currencies (K / M / B).
 */
function formatAmount(amount: unknown, currency = "INR"): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";

  if (currency === "INR") {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
    if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)} K`;
    return `₹${n.toLocaleString("en-IN")}`;
  }

  const SYMBOLS: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  };
  const sym = SYMBOLS[currency] ?? currency;
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toLocaleString()}`;
}

// ─── Opportunity Created ──────────────────────────────────────────────────────

export interface OppCreatedParams {
  tenantId: string;
  opportunityId: string;
  opportunityName: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
  amount: unknown;
  currency: string;
}

/**
 * Notify the owner (if different from creator) and all sales managers when
 * an opportunity is created.
 */
export async function notifyOpportunityCreated(p: OppCreatedParams): Promise<void> {
  const amtStr = formatAmount(p.amount, p.currency);
  const body = amtStr
    ? `"${p.opportunityName}" was created by ${p.actorName}. Value: ${amtStr}.`
    : `"${p.opportunityName}" was created by ${p.actorName}.`;

  const recipients = new Set<string>();
  if (p.ownerId && p.ownerId !== p.actorUserId) recipients.add(p.ownerId);
  const managers = await getSalesManagers(p.tenantId, p.actorUserId);
  managers.forEach((id) => recipients.add(id));

  if (recipients.size === 0) return;

  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotification({
        tenantId: p.tenantId,
        userId,
        type: "lead_assigned",
        category: "lead",
        title: "New opportunity created",
        body,
        link: `/opportunities/${p.opportunityId}`,
        metadata: {
          type: "opportunity_created",
          opportunityId: p.opportunityId,
          opportunityName: p.opportunityName,
          amount: amtStr,
          currency: p.currency,
          createdByName: p.actorName,
        },
      }),
    ),
  );
}

// ─── Opportunity Stage Changed ────────────────────────────────────────────────

export interface OppStageChangedParams {
  tenantId: string;
  opportunityId: string;
  opportunityName: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
  fromStage: string;
  toStage: string;
}

/**
 * Notify the owner when stage changes (for non-terminal transitions).
 * Suppressed when actor === owner (they already know what they did).
 */
export async function notifyOpportunityStageChanged(
  p: OppStageChangedParams,
): Promise<void> {
  if (!p.ownerId) return;
  if (p.ownerId === p.actorUserId) return;

  await createNotification({
    tenantId: p.tenantId,
    userId: p.ownerId,
    type: "lead_stage_changed",
    category: "lead",
    title: "Opportunity stage updated",
    body: `"${p.opportunityName}" moved from ${p.fromStage} to ${p.toStage} by ${p.actorName}.`,
    link: `/opportunities/${p.opportunityId}`,
    metadata: {
      type: "opportunity_stage_changed",
      opportunityId: p.opportunityId,
      opportunityName: p.opportunityName,
      fromStage: p.fromStage,
      toStage: p.toStage,
      actorName: p.actorName,
    },
  });
}

// ─── Opportunity Won  🎉 ──────────────────────────────────────────────────────

export interface OppWonParams {
  tenantId: string;
  opportunityId: string;
  opportunityName: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
  amount: unknown;
  currency: string;
  closeReasonCategory: string | null | undefined;
}

/**
 * Celebration notification — sent to the owner AND all sales managers.
 * Managers are included even when they are the actor; winning is worth the noise.
 * The deal value is formatted and prominently shown in the notification body.
 */
export async function notifyOpportunityWon(p: OppWonParams): Promise<void> {
  const amtStr = formatAmount(p.amount, p.currency);

  const bodyLines = [`"${p.opportunityName}" is now Closed Won.`];
  if (amtStr) bodyLines.push(`Deal value: ${amtStr}.`);
  if (p.actorUserId !== p.ownerId) bodyLines.push(`Closed by ${p.actorName}.`);

  const title = "🎉 Opportunity Won!";
  const body  = bodyLines.join(" ");

  const recipients = new Set<string>();
  if (p.ownerId) recipients.add(p.ownerId);
  // Include ALL managers — every win is a team win.
  const managers = await getSalesManagers(p.tenantId, "__none__");
  managers.forEach((id) => recipients.add(id));

  if (recipients.size === 0) return;

  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotification({
        tenantId: p.tenantId,
        userId,
        type: "lead_converted",   // TypeScript-valid type; metadata.type drives the icon.
        category: "lead",
        title,
        body,
        link: `/opportunities/${p.opportunityId}`,
        skipEmail: false,
        metadata: {
          type: "opportunity_won", // ← UI reads this for the Trophy/gold icon.
          opportunityId: p.opportunityId,
          opportunityName: p.opportunityName,
          amount: amtStr,
          currency: p.currency,
          closedByName: p.actorName,
          closeReasonCategory: p.closeReasonCategory,
        },
      }),
    ),
  );
}

// ─── Opportunity Lost ─────────────────────────────────────────────────────────

export interface OppLostParams {
  tenantId: string;
  opportunityId: string;
  opportunityName: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
  closeReasonCategory: string | null | undefined;
  closeReason: string | null | undefined;
}

/**
 * Notify owner + sales managers when opportunity is marked ClosedLost.
 */
export async function notifyOpportunityLost(p: OppLostParams): Promise<void> {
  const reasonLine = p.closeReasonCategory ? ` Reason: ${p.closeReasonCategory}.` : "";
  const body = `"${p.opportunityName}" was marked as lost by ${p.actorName}.${reasonLine}`;

  const recipients = new Set<string>();
  if (p.ownerId) recipients.add(p.ownerId);
  const managers = await getSalesManagers(p.tenantId, p.actorUserId);
  managers.forEach((id) => recipients.add(id));

  if (recipients.size === 0) return;

  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotification({
        tenantId: p.tenantId,
        userId,
        type: "lead_reassigned",
        category: "lead",
        title: "Opportunity lost",
        body,
        link: `/opportunities/${p.opportunityId}`,
        metadata: {
          type: "opportunity_lost",
          opportunityId: p.opportunityId,
          opportunityName: p.opportunityName,
          closeReasonCategory: p.closeReasonCategory,
          closeReason: p.closeReason,
          closedByName: p.actorName,
        },
      }),
    ),
  );
}
