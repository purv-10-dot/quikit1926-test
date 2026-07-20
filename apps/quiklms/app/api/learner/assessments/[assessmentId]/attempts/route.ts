import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getQuizAttempts } from '@/lib/services/assessments-service';

/**
 * GET /api/learner/assessments/:assessmentId/attempts
 *
 * This returned a hardcoded `[]`. Its "DEFERRED until assessments is ported"
 * comment was stale — `getQuizAttempts` has been implemented all along
 * (`assessments-service.ts:117`) and the sibling submit-quiz route already
 * imports it.
 *
 * The consequence was user-visible: `InteractiveQuizComponent` computes
 * `alreadyTaken = attempts.length >= 1 || fromProgress`, so a learner who had
 * already used their single attempt was shown "1 attempt remaining" and let back
 * into the quiz, only to be rejected server-side on submit.
 *
 * Returns `[]` on any failure, matching the legacy's resilient shape
 * (`learner.controller.ts:189-220`) — a lookup error must not block the player.
 */
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  if (!user.orgId || !user.id) return json({ success: true, data: [] });

  try {
    const attempts = await getQuizAttempts(user.orgId, user.id, params!.assessmentId);
    return json({ success: true, data: attempts });
  } catch {
    return json({ success: true, data: [] });
  }
});
