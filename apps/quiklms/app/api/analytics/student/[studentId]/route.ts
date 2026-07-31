import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assertCanViewStudent } from '@/lib/auth/student-access';
import { getStudentProgress } from '@/lib/services/analytics-service';

/**
 * GET /api/analytics/student/:studentId — TENANT_ADMIN | SUB_ADMIN | TEACHER | PARENT
 *
 * The relationship check that used to live inline here has moved to
 * `lib/auth/student-access.ts` so the gradebook, exam-results and homework
 * routes enforce the identical rule. Keeping a private copy per route is what
 * let those four endpoints drift out of sync in the first place.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER', 'PARENT']);
  await assertCanViewStudent(actor, params!.studentId);
  return json(await getStudentProgress(actor.orgId ?? '', params!.studentId));
});
