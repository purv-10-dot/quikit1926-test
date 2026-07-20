import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * POST /api/progress/:courseId/lesson/:lessonId/complete — mark a lesson complete.
 *
 * This endpoint has NO counterpart in the NestJS original; it was invented by
 * the port, and its hand-rolled implementation wrote a progress shape that
 * nothing reads:
 *
 *  - it stored `{ completed: true, completedAt }`, but `isResourceCompleted`
 *    (`progress-service.ts:34`) only looks at `isCompleted` / `completionPercentage`,
 *    so every lesson it "completed" still counted as incomplete;
 *  - it overwrote `completionPercentage` with a naive lesson count that ignored
 *    quizzes entirely and never set `scorePercentage`;
 *  - it hardcoded the status with no due-date derivation, so it could not
 *    produce `Overdue` and would silently downgrade one;
 *  - it never triggered certificate issuance; and
 *  - it collapsed every error into `success: true`, so a total failure looked
 *    identical to a success.
 *
 * Any call therefore degraded that learner's course record. It now delegates to
 * `syncProgress`, the same engine every other write path uses, which handles the
 * weighted average, the lifecycle status and the certificate trigger correctly.
 */
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId || !actor.id) {
    return json({ success: false, message: 'Tenant ID and Learner ID are required' }, 400);
  }

  const { courseId, lessonId } = params!;

  const progress = await syncProgress({
    orgId: actor.orgId,
    learnerId: actor.id,
    courseId,
    lessonId,
    completionPercentage: 100, // this lesson is done
    status: 'Completed',
  });

  return json({
    success: true,
    data: {
      completed: true,
      lessonId,
      completionPercentage: progress?.completionPercentage ?? 0,
      status: progress?.status,
    },
  });
});
