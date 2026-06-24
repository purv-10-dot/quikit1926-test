/**
 * Digest recipient / org enumeration — the cross-tenant sweep seam for the
 * daily digest. Mirrors the cross-tenant shape of task-cron (process every org),
 * but the digest only touches orgs that have opted in (config read in digest-run).
 *
 * ─── WHAT IS REAL vs. STUBBED (honest scope for this step-1 plumbing unit) ────
 *
 *  listActiveDigestOrgs()  — REAL, thin query. Returns every orgId that has ANY
 *    QuikCRM app-role row (CrmUserAppRole). This is the candidate set; digest-run
 *    then filters by getDigestConfig(org).enabled (the opt-in gate). We do NOT
 *    re-implement "active org" detection — presence of app-roles is the cheapest
 *    correct proxy for "an org that uses QuikCRM".
 *
 *  listDigestRecipients(orgId, roles) — REAL, thin query. Joins CrmUserAppRole →
 *    CrmAppRole (role.name) → User (email/name) for the org, maps each app-role
 *    name to a SessionUser role via the inverted MEMBERSHIP_ROLE_TO_APP_ROLE map,
 *    keeps only the requested leadership roles, and returns a constructed
 *    SessionUser per recipient. The SessionUser is what digest-run passes to
 *    buildRoleMetrics / getActivityFieldAggregates — so scoping is by construction
 *    (the per-recipient leak-safe reuse).
 *
 *  ⚠️ FLAGGED / OWED (NOT over-built in this unit):
 *    - app-role-name → SessionUser-role mapping here is the INVERSE of the
 *      shipped MEMBERSHIP_ROLE_TO_APP_ROLE table. It is NOT routed through the
 *      richer mapRole() in lib/auth/require.ts (that fn is module-private and
 *      reads live session/UserAppAccess overrides). For leadership enumeration
 *      the inverse table is sufficient; if an org grants leadership via
 *      UserAppAccess override (not a CrmUserAppRole row), that recipient would be
 *      MISSED. Acceptable for the demo; revisit if Dev confirms override-granted
 *      leaders must receive the digest.
 *    - No de-dup across multiple app-role rows for the same user beyond the
 *      Map keyed by userId below (a user with two leadership roles → highest is
 *      arbitrary-by-iteration; fine for recipient listing, not a scoping concern).
 *    - Real-data verification (against actual configured roles) is OWED on the
 *      login-fix cluster, like the rest of the activity surface.
 */

import { prisma } from "@/lib/db/prisma";
import { MEMBERSHIP_ROLE_TO_APP_ROLE } from "@/lib/api/permissions-registry";
import type { SessionUser } from "@/types/permission";

// Inverted map: app-role name ("admin", "sales-manager", …) → SessionUser role.
const APP_ROLE_NAME_TO_SESSION_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(MEMBERSHIP_ROLE_TO_APP_ROLE).map(([sessionRole, appName]) => [appName, sessionRole]),
);

/** Every org that has any QuikCRM app-role row — the cross-tenant candidate set. */
export async function listActiveDigestOrgs(): Promise<string[]> {
  const rows = await prisma.crmUserAppRole.findMany({
    distinct: ["orgId"],
    select: { orgId: true },
  });
  return rows.map((r) => r.orgId);
}

/**
 * Leadership recipients for an org, as constructed SessionUsers.
 *
 * Allow-list (REPLACE semantics): when `recipientUserIds` is NON-EMPTY, ONLY those
 * userIds receive the digest and `roles` is IGNORED. EMPTY ([]) or absent → fall
 * back to the role-based set (NOT "email nobody"). CRITICAL: on EITHER path each
 * recipient's SessionUser carries their REAL role (resolved from their app-role
 * row), so per-recipient scoping stays correct — the allow-list decides WHO, the
 * role decides WHAT they see. A named user with no resolvable app-role row is
 * skipped (we can't scope them safely).
 */
export async function listDigestRecipients(
  orgId: string,
  roles: string[],
  recipientUserIds?: string[],
): Promise<SessionUser[]> {
  const wanted = new Set(roles);
  const allowList = recipientUserIds && recipientUserIds.length > 0 ? new Set(recipientUserIds) : null;

  const rows = await prisma.crmUserAppRole.findMany({
    where: { orgId },
    select: {
      userId: true,
      role: { select: { name: true } },
    },
  });

  // userId → REAL SessionUser role, de-duped (a user may hold >1 app-role row).
  // Resolve EVERY row's real role first; the recipient FILTER (allow-list vs
  // roles) is applied separately so the allow-list path keeps the real role.
  const byUser = new Map<string, string>();
  for (const r of rows) {
    const sessionRole = APP_ROLE_NAME_TO_SESSION_ROLE[r.role?.name ?? ""] ?? null;
    if (!sessionRole || byUser.has(r.userId)) continue;

    if (allowList) {
      // REPLACE: include iff named in the allow-list (role NOT consulted for
      // inclusion — but the real role IS kept for scoping).
      if (allowList.has(r.userId)) byUser.set(r.userId, sessionRole);
    } else {
      // Role fallback: include iff the real role is one of the wanted roles.
      if (wanted.has(sessionRole)) byUser.set(r.userId, sessionRole);
    }
  }

  if (byUser.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(byUser.keys()) } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const recipients: SessionUser[] = [];
  for (const u of users) {
    const role = byUser.get(u.id);
    if (!role || !u.email) continue;
    recipients.push({
      userId: u.id,
      orgId,
      role,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim(),
    });
  }
  return recipients;
}
