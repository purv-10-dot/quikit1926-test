import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getStudentGrades } from '@/lib/services/gradebook-service';

// GET /api/gradebook/student/:id
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  return json(await getStudentGrades(user.orgId as string, params!.id));
});
