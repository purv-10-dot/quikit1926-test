/**
 * Digest recipient / org enumeration for the daily digest.
 *
 * ROOT FIX (Stage 5): recipient resolution NO LONGER uses CrmUserAppRole. That
 * table was empty for the configured recipients (Akhilesh/Sanyukta) → both were
 * silently dropped → digestCount:0. Resolution now mirrors how session.role
 * actually resolves (OrgMember.role + appId-scoped UserAppAccess via
 * resolveCrmRole), and re-checks isDigestEligible at send.
 *
 *  resolveDigestRecipients(orgId, recipientUserIds) — the UI-managed allow-list is
 *    the source of truth. For EACH userId: resolve the CRM role the same way
 *    readSession does, re-check eligibility, DROP ineligible (defense-in-depth: a
 *    SalesManager who lost their team since being toggled on must not get an
 *    empty/garbage digest), and build a per-recipient SessionUser (so downstream
 *    buildRoleMetrics / getActivityFieldAggregates scope correctly by construction).
 *    Empty allow-list → no recipients (the UI owns the list; auto-flip makes
 *    "enabled but empty" impossible, so there is no role-fallback case to handle).
 *
 *  listActiveDigestOrgs() — orgs that have a digest config (any
 *    CrmOrgWorkspaceSettings row with a `digest` key). digest-run then filters by
 *    getDigestConfig(org).enabled. (Was "orgs with a CrmUserAppRole row" — that was
 *    coincidental and the silent-skip's sibling.)
 */

import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { resolveCrmRole } from "@/lib/auth/role-resolution";
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";
import type { SessionUser } from "@/types/permission";

/**
 * Orgs that have a digest config. We enumerate CrmOrgWorkspaceSettings rows whose
 * settings JSON contains a `digest` key — cheap candidate set; digest-run applies
 * the real opt-in gate (getDigestConfig(org).enabled).
 */
export async function listActiveDigestOrgs(): Promise<string[]> {
  const rows = await prisma.crmOrgWorkspaceSettings.findMany({
    where: { settings: { path: ["digest"], not: Prisma.DbNull } },
    select: { orgId: true },
  });
  return rows.map((r) => r.orgId);
}

/**
 * Resolve the allow-listed userIds into eligible per-recipient SessionUsers.
 * Role resolution + eligibility mirror readSession / Settings→Users exactly.
 */
export async function resolveDigestRecipients(
  orgId: string,
  recipientUserIds: string[],
): Promise<SessionUser[]> {
  if (!recipientUserIds || recipientUserIds.length === 0) return [];

  const appId = await getQuikCrmAppId();

  const [members, appAccess, users] = await Promise.all([
    prisma.orgMember.findMany({
      where: { orgId, userId: { in: recipientUserIds } },
      select: { userId: true, role: true },
    }),
    appId
      ? prisma.userAppAccess.findMany({
          where: { userId: { in: recipientUserIds }, orgId, appId },
          select: { userId: true, role: true },
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { id: { in: recipientUserIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  ]);

  const memberRole = new Map(members.map((m) => [m.userId, m.role]));
  const appAccessRole = new Map(appAccess.map((a) => [a.userId, a.role]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const recipients: SessionUser[] = [];
  // Preserve allow-list order; resolve + eligibility-check each.
  for (const userId of recipientUserIds) {
    const u = userById.get(userId);
    if (!u || !u.email) continue; // no user / no email → can't deliver

    const role = resolveCrmRole({
      membershipRole: memberRole.get(userId),
      appAccessRole: appAccessRole.get(userId) ?? null,
    });

    // Send-time eligibility re-check — drop anyone no longer eligible (e.g. a
    // SalesManager who lost their team since being toggled on).
    const elig = await isDigestEligible({ userId, orgId, role });
    if (!elig.eligible) continue;

    recipients.push({
      userId,
      orgId,
      role,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim(),
    });
  }
  return recipients;
}
