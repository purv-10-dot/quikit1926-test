/**
 * applyPendingInvitesForEmail — accept any pending BrandInvite rows for
 * the given email and upsert their assignments into BrandMembership.
 *
 * Called from the QuikSocial NextAuth events.signIn (OIDC flow). When a
 * user signs in via QuiKit SSO and lands on the QuikSocial app for the
 * first time, this hook finds invites pre-issued against their email and
 * materialises them into BrandMembership rows. Idempotent: invites
 * already marked accepted are skipped.
 *
 * If the user has no UserPreference.activeBrandId yet, the first brandId
 * from any accepted assignment becomes their active brand. Only sets it
 * when no existing value — never yanks a logged-in user out of their
 * current brand.
 *
 * Ported to QuikIT (Phase 3, Batch 4):
 *   - orgId is passed in (from session.user.orgId mapped via OIDC profile)
 *     instead of relying on the legacy DEFAULT_TENANT_ID constant.
 */

import { db } from "@/lib/db";
import {
  seedAllDefaultRoles,
  ensureUserOnRole,
} from "@/lib/rbac/seedDefaultRoles";

/**
 * @returns number of invites accepted (0 when nothing was pending)
 */
export async function applyPendingInvitesForEmail(
  orgId: string,
  email: string,
  userId: string,
): Promise<number> {
  if (!orgId || !email || !userId) return 0;

  const normalized = email.toLowerCase().trim();

  const invites = await db.brandInvite.findMany({
    where: {
      orgId,
      email: normalized,
      status: "pending",
    },
    include: { assignments: true },
  });

  if (!invites.length) return 0;

  let firstBrandId: string | null = null;

  for (const invite of invites) {
    await db.$transaction(async (tx) => {
      for (const assignment of invite.assignments) {
        if (!assignment.brandId || !assignment.role) continue;

        await tx.brandMembership.upsert({
          where: {
            orgId_userId_brandId: {
              orgId: invite.orgId,
              userId,
              brandId: assignment.brandId,
            },
          },
          update: {
            email: normalized,
            workspace: assignment.workspace,
            role: assignment.role,
            invitedBy: invite.invitedBy,
          },
          create: {
            orgId: invite.orgId,
            userId,
            brandId: assignment.brandId,
            email: normalized,
            workspace: assignment.workspace,
            role: assignment.role,
            invitedBy: invite.invitedBy,
          },
        });

        if (!firstBrandId) firstBrandId = assignment.brandId;
      }

      await tx.brandInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedByUserId: userId,
          acceptedAt: new Date(),
        },
      });
    });
  }

  // Set activeBrandId on UserPreference only if not already set.
  if (firstBrandId) {
    const existing = await db.userPreference.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!existing) {
      await db.userPreference.create({
        data: {
          orgId,
          userId,
          activeBrandId: firstBrandId,
        },
      });
    } else if (!existing.activeBrandId) {
      await db.userPreference.update({
        where: { orgId_userId: { orgId, userId } },
        data: { activeBrandId: firstBrandId },
      });
    }
  }

  // Org-level RBAC parity (matches QuikScale/QuikTrack): land the user on the
  // default "User" org-role so they have a QsUserAppRole alongside the
  // brand-level BrandMembership rows above. Best-effort — the
  // /api/me/permissions lazy seed remains the fallback if this throws.
  try {
    const { userRoleId } = await seedAllDefaultRoles(orgId);
    await ensureUserOnRole(userId, orgId, userRoleId);
  } catch {
    // swallow — never block sign-in on org-role assignment
  }

  return invites.length;
}
