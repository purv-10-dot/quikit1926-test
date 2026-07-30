import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assertCanViewStudent } from '@/lib/auth/student-access';
import { getStudentSubmissions } from '@/lib/services/homework-service';

// GET /api/homework/student/submissions?studentId= — LEARNER | PARENT
//
// `studentId` is caller-supplied, so it CANNOT be the authorization decision.
// Previously the ternary below took the parameter on trust, letting any parent
// read any student's submissions, grades and teacher feedback.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER', 'PARENT']);
  const url = new URL(req.url);
  const studentIdParam = url.searchParams.get('studentId') || undefined;
  const studentId = actor.role === 'PARENT' && studentIdParam ? studentIdParam : actor.id;
  // No-op when studentId === actor.id (the learner path); enforces the
  // parent↔child link via LmsUserParent when a parent supplies an id.
  await assertCanViewStudent(actor, studentId);
  return json(
    await getStudentSubmissions(actor.orgId!, studentId, {
      status: url.searchParams.get('status') || undefined,
    }),
  );
});
