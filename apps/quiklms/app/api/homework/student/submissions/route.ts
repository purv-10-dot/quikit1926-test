import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentSubmissions } from '@/lib/services/homework-service';

// GET /api/homework/student/submissions — LEARNER | PARENT
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER', 'PARENT']);
  const url = new URL(req.url);
  const studentIdParam = url.searchParams.get('studentId') || undefined;
  const studentId = actor.role === 'PARENT' && studentIdParam ? studentIdParam : actor.id;
  return json(
    await getStudentSubmissions(actor.orgId!, studentId, {
      status: url.searchParams.get('status') || undefined,
    }),
  );
});
