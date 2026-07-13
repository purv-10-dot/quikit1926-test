import { z } from 'zod';
import { route, json, BadRequest, NotFound } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { orgDb } from '@/lib/org-db';

const actionSchema = z.object({
  membershipId: z.string().min(1),
  action: z.enum(['accept', 'decline']),
});

/**
 * POST /api/org/invitations — accept or decline a pending platform invitation
 * (an OrgMember row in status "invited"). On accept: flips to "active", clears
 * the single-use token, and grants the apps the invite was for (mirrors the
 * canonical accept in @quikit/auth). Reads the PLATFORM db via `orgDb`.
 *
 * Most invites are auto-accepted on first SSO login by @quikit/auth's signIn/jwt
 * callbacks; this covers the explicit in-app accept/decline (e.g. an invite to a
 * SECOND org while already signed in) and mirrors quikscale's route.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);

  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw BadRequest(parsed.error.errors[0]?.message ?? 'Invalid input');
  const { membershipId, action } = parsed.data;

  // Belongs to this user and is still pending. Accept both the canonical
  // "invited" and the legacy "pending" status value.
  const membership = await orgDb.orgMember.findFirst({
    where: { id: membershipId, userId: actor.id, status: { in: ['invited', 'pending'] } },
  });
  if (!membership) throw NotFound('Invitation not found or already processed');

  if (action === 'decline') {
    await orgDb.orgMember.update({
      where: { id: membershipId },
      data: { status: 'inactive' },
    });
    return json({ success: true, data: { status: 'declined' } });
  }

  // Accept — activate the membership (single-use token cleared).
  await orgDb.orgMember.update({
    where: { id: membershipId },
    data: { status: 'active', acceptedAt: new Date(), invitationToken: null },
  });

  // Grant the apps the invite was for (idempotent). app_admin → admin per app.
  if (membership.inviteAppIds?.length) {
    await orgDb.userAppAccess.createMany({
      data: membership.inviteAppIds.map((appId) => ({
        userId: actor.id,
        orgId: membership.orgId,
        appId,
        role: membership.role === 'app_admin' ? 'admin' : 'member',
        grantedBy: membership.createdBy ?? undefined,
      })),
      skipDuplicates: true,
    });
  }

  return json({ success: true, data: { status: 'active', orgId: membership.orgId } });
});
