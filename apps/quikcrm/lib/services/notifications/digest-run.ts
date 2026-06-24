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
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";
import {
  listActiveDigestOrgs,
  listDigestRecipients,
} from "@/lib/services/notifications/digest-recipients";
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
  fieldAggregates: { activityTypeId: string; aggregates: ActivityFieldAggregate[] }[];
  isDemo: boolean;
  demoBanner: string;
}

export interface DigestRunResult {
  digests: AssembledDigest[];
  isDemo: boolean;
}

/** activitiesByType lives on Admin/SalesManager/SalesUser DTOs; read defensively. */
function readActivitiesByType(dto: RoleMetricsDto): { type: string; count: number }[] {
  const m = dto.metrics as { activitiesByType?: { type: string; count: number }[] };
  return m?.activitiesByType ?? [];
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

export async function runDailyDigest(): Promise<DigestRunResult> {
  const orgs = await listActiveDigestOrgs();
  const digests: AssembledDigest[] = [];

  for (const orgId of orgs) {
    const cfg = await getDigestConfig(orgId);
    if (!cfg.enabled) continue; // opt-in: skip orgs that didn't turn it on

    // Top-N types: ONCE per org, above the recipient loop.
    const topTypes = await selectTopNTypes(orgId, cfg.types);

    const optOut = new Set(cfg.optOut);
    const recipients = (await listDigestRecipients(orgId, cfg.recipientRoles)).filter(
      (r) => !optOut.has(r.userId),
    );

    for (const recipient of recipients) {
      // Services called AS-IS — per-recipient user, NO range arg (unit (i) deferred).
      const metrics = await buildRoleMetrics(recipient);

      const fieldAggregates: AssembledDigest["fieldAggregates"] = [];
      for (const activityTypeId of topTypes) {
        const aggregates = await getActivityFieldAggregates(recipient, { activityTypeId });
        fieldAggregates.push({ activityTypeId, aggregates });
      }

      digests.push({
        recipient,
        activitiesByType: readActivitiesByType(metrics),
        fieldAggregates,
        isDemo: true,
        demoBanner: DIGEST_DEMO_BANNER,
      });
    }
  }

  return { digests, isDemo: true };
}
