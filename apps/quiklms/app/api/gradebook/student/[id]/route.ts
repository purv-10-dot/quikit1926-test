import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertCanViewStudent } from '@/lib/auth/student-access';
import { getStudentGrades } from '@/lib/services/gradebook-service';

// GET /api/gradebook/student/:id — self | admins | the student's own parent,
// teacher or manager. Was `requireAuth` only, so ANY learner could read ANY
// user's grade record by id (the legacy backend had the same hole).
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  await assertCanViewStudent(user, params!.id);
  return json(await getStudentGrades(user.orgId as string, params!.id));
});
