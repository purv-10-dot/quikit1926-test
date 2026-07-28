import { z } from 'zod';
import { resolveOrgInvitation } from '@quikit/auth/accept-invitation';
import { route, json, BadRequest, NotFound } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { orgDb } from '@/lib/org-db';

const actionSchema = z.object({
  membershipId: z.string().min(1),
  action: z.enum(['accept', 'decline']),
});

/**
 * POST /api/org/invitations — accept or decline a pending platform invitation
 * (an `OrgMember` row in status "invited").
 *
 * The activation logic itself lives in `@quikit/auth/accept-invitation`. It used
 * to be re-implemented inline here — flipping the status, clearing the token and
 * expanding `inviteAppIds` by hand — and the comment even conceded it "mirrors
 * the canonical accept in @quikit/auth". Duplicated security-relevant logic
 * drifts, and it had: the sibling copy in quikscale never cleared
 * `invitationToken` and granted every active app rather than the invited set.
 * One shared implementation now serves both.
 *
 * Most invitations never reach this route — they are auto-accepted on the
 * invitee's first central login by `@quikit/auth`'s signIn/jwt callbacks. This
 * covers the case those cannot: an already-signed-in user accepting an
 * invitation to a SECOND org.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);

  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw BadRequest(parsed.error.errors[0]?.message ?? 'Invalid input');
  const { membershipId, action } = parsed.data;

  // `userId` comes from the session, so a caller can only ever act on their own
  // invitation regardless of the membershipId they supply.
  const result = await resolveOrgInvitation(orgDb, { membershipId, userId: actor.id, action });
  if (!result) throw NotFound('Invitation not found or already processed');

  return json({
    success: true,
    data:
      result.status === 'inactive'
        ? { status: 'declined' }
        : { status: 'active', orgId: result.orgId },
  });
});
