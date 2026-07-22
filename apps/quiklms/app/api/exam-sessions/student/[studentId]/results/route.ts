import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assertCanViewStudent } from '@/lib/auth/student-access';
import { getStudentResults } from '@/lib/services/exam-sessions-service';

// GET /api/exam-sessions/student/:studentId/results — PARENT | TENANT_ADMIN | SUB_ADMIN | TEACHER
//
// The role guard says "a parent"; the relationship check says "THAT student's
// parent". Without the second, any parent in the org could read any student's
// full exam history — scores, pass/fail and teacher remarks — by id. The legacy
// backend carried the identical hole (`exam-sessions.controller.ts:61-66`).
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  await assertCanViewStudent(actor, params!.studentId);
  const results = await getStudentResults(actor, params!.studentId);
  return json({ success: true, data: results });
});
