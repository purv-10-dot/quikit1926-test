/**
 * Daily digest render-loop SKELETON (Phase 5, step-1 plumbing).
 *
 *   enabled orgs → per org: select top-N types ONCE (hoisted above recipients,
 *   since types are org-level) → leadership recipients (minus optOut) → per
 *   recipient: call buildRoleMetrics(user) + getActivityFieldAggregates(user,
 *   {activityTypeId}) AS-IS → assemble that recipient's scoped sections.
 *
 * ─── STEP-1 SCOPE (deliberate, locked) ───────────────────────────────────────
 *  - ZERO shared-function edits. buildRoleMetrics / getActivityFieldAggregates
 *    are called AS THEY EXIST — i.e. ALL-TIME, NO window arg. The "yesterday"
 *    window is unit (i), DEFERRED until the digest shape is Dev-confirmed. This
 *    file must never pass a range to them.
 *  - Because the data is all-time, every assembled digest carries an UNMISSABLE
 *    DEMO banner so the artifact taken to Dev can't be mistaken for the real
 *    daily digest. Review STRUCTURE, not the (all-time) numbers.
 *  - No email is sent here (the template is a separate chat). This returns the
 *    assembled digests; wiring to the email rails comes later.
 */

import { prisma } from "@/lib/db/prisma";
import { getDigestConfig } from "@/lib/services/workspace/digest-config";
import { buildRoleMetrics, type MetricsRange } from "@/lib/services/dashboard/role-metrics";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";
import { getCompletedTasksByRep } from "@/lib/services/dashboard/completed-tasks";
import {
  listActiveDigestOrgs,
  resolveDigestRecipients,
} from "@/lib/services/notifications/digest-recipients";
import { sendDigestEmail } from "@/lib/services/notifications/digest-email";
import { rollingWindowUtc } from "@/lib/services/notifications/digest-window";
import type { SessionUser } from "@/types/permission";
import type { ActivityFieldAggregate } from "@/lib/services/dashboard/activity-field-aggregates";
import type { RoleMetricsDto } from "@/lib/dashboard/role-metrics-types";

// The unmissable demo banner — baked into every assembled digest while the data
// is all-time (window unit (i) deferred). MUST contain DEMO + all-time + structure.
export const DIGEST_DEMO_BANNER =
  "⚠️ DEMO — all-time totals, daily windowing not built yet; review STRUCTURE, not numbers.";

const TOP_N_TYPES = 5;

export interface AssembledDigest {
  recipient: SessionUser;
  activitiesByType: { type: string; count: number }[];
  /** True per-rep activity volume (§1) — count of activities per owner, tier-scoped. */
  activityByRep: { ownerId: string; ownerName: string | null; count: number }[];
  fieldAggregates: { activityTypeId: string; aggregates: ActivityFieldAggregate[] }[];
  /** §4 — tasks COMPLETED in the rolling window, per rep (assignedToUserId), tier-scoped. */
  completedTasksByRep: { userId: string; ownerName: string | null; count: number }[];
  completedTasksTotal: number;
  /** Which digest produced this — drives the email subject/header framing. */
  variant: "daily" | "weekly";
  isDemo: boolean;
  demoBanner: string;
}

export interface DigestRunResult {
  /** Recipients RESOLVED + assembled (NOT the send outcome). digestCount. */
  digests: AssembledDigest[];
  isDemo: boolean;
  /** Sends that SUCCEEDED (≤ digests.length). */
  sentCount: number;
  /** Sends that FAILED — a send failure surfaces HERE, never as a dropped digest. */
  errorCount: number;
}

/** activitiesByType lives on Admin/SalesManager/SalesUser DTOs; read defensively. */
function readActivitiesByType(dto: RoleMetricsDto): { type: string; count: number }[] {
  const m = dto.metrics as { activitiesByType?: { type: string; count: number }[] };
  return m?.activitiesByType ?? [];
}

/** activityByRep lives on Admin/SalesManager/SalesUser DTOs; read defensively. */
function readActivityByRep(
  dto: RoleMetricsDto,
): { ownerId: string; ownerName: string | null; count: number }[] {
  const m = dto.metrics as { activityByRep?: { ownerId: string; ownerName: string | null; count: number }[] };
  return m?.activityByRep ?? [];
}

/**
 * Top-N activity types for an org by all-time volume. PER-ORG (types are
 * org-level), hoisted ABOVE the recipient loop. NOTE: all-time (no window) —
 * windowing is part of unit (i). Returns activityType *ids*.
 *
 * groupBy is keyed by CrmActivity.type (the free-string type label). Until the
 * type-id linkage lands (activityTypeId column deferred), we rank by `type`
 * label and pass the label through as the id seam — the per-type aggregate call
 * is stubbed/all-time in this unit anyway.
 */
async function selectTopNTypes(orgId: string, configured?: string[]): Promise<string[]> {
  if (configured && configured.length > 0) return configured;
  const rows = await prisma.crmActivity.groupBy({
    by: ["type"],
    where: { orgId },
    _count: { _all: true },
    orderBy: { _count: { type: "desc" } },
    take: TOP_N_TYPES,
  });
  return rows.map((r) => r.type);
}

/**
 * Shared assembly+send for both digest variants. The org→recipient loop and §1–§4
 * build are VERBATIM; only the reporting `range` and the `variant` framing differ.
 * runDailyDigest / runWeeklyDigest are thin wrappers that supply those.
 */
async function assembleAndSendDigests(
  range: MetricsRange,
  opts: { variant: "daily" | "weekly" },
): Promise<DigestRunResult> {
  const orgs = await listActiveDigestOrgs();
  const digests: AssembledDigest[] = [];
  let sentCount = 0;
  let errorCount = 0;

  for (const orgId of orgs) {
    const cfg = await getDigestConfig(orgId);
    if (!cfg.enabled) continue; // opt-in: skip orgs that didn't turn it on

    // Top-N types: ONCE per org, above the recipient loop.
    const topTypes = await selectTopNTypes(orgId, cfg.types);

    const optOut = new Set(cfg.optOut);
    // Recipients come from the UI-managed allow-list (settings.digest.recipientUserIds),
    // resolved to eligible per-recipient SessionUsers (role+eligibility, no
    // CrmUserAppRole — the silent-skip root fix). optOut still applies on top.
    const recipients = (
      await resolveDigestRecipients(orgId, cfg.recipientUserIds)
    ).filter((r) => !optOut.has(r.userId));

    for (const recipient of recipients) {
      // GO-LIVE: per-recipient metrics WINDOWED to yesterday (IST). The window
      // param (unit (i)) is real-DB-verified; here it is finally wired with the
      // yesterday-IST range. §1 shows true per-rep activity VOLUME (activityByRep),
      // now for yesterday only.
      const metrics = await buildRoleMetrics(recipient, range);

      const fieldAggregates: AssembledDigest["fieldAggregates"] = [];
      for (const activityTypeId of topTypes) {
        const aggregates = await getActivityFieldAggregates(recipient, { activityTypeId, range });
        fieldAggregates.push({ activityTypeId, aggregates });
      }

      // §4 — completed tasks in the SAME rolling window, tier-scoped per recipient
      // (same scoping path as the activity metrics, keyed on assignedToUserId).
      const completedTasks = await getCompletedTasksByRep(recipient, { range });

      const assembled: AssembledDigest = {
        recipient,
        activitiesByType: readActivitiesByType(metrics),
        activityByRep: readActivityByRep(metrics),
        fieldAggregates,
        completedTasksByRep: completedTasks.perRep,
        completedTasksTotal: completedTasks.total,
        variant: opts.variant,
        isDemo: false, // GO-LIVE: window wired → real yesterday data → DEMO banner OFF
        demoBanner: DIGEST_DEMO_BANNER, // retained on the type; renderDemoBanner gates on isDemo
      };
      digests.push(assembled); // RESOLVED — counted regardless of send outcome

      // Per-recipient send (DEMO-bannered all-time data; demo-send is NOT gated on
      // go-live — the banner rides on isDemo). Per-recipient try/catch: one
      // recipient's failure must NOT abort the others (partial success). A send
      // failure surfaces as errorCount, NEVER as a dropped digest.
      try {
        await sendDigestEmail(assembled);
        sentCount++;
      } catch (err) {
        errorCount++;
        console.error("[digest-cron] send failed for recipient", recipient.userId, err);
      }
    }
  }

  return { digests, isDemo: false, sentCount, errorCount }; // GO-LIVE: no longer demo
}

/** Daily digest — rolling 24h window. Fires daily (20:30 IST cron). */
export function runDailyDigest(): Promise<DigestRunResult> {
  return assembleAndSendDigests(rollingWindowUtc(new Date(), 1), { variant: "daily" });
}

/** Weekly summary — rolling 7-day window. Fires Friday (20:30 IST cron). Full
 *  4-section structure; overlaps Friday's daily by design (a recap includes today). */
export function runWeeklyDigest(): Promise<DigestRunResult> {
  return assembleAndSendDigests(rollingWindowUtc(new Date(), 7), { variant: "weekly" });
}
