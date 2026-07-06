import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getUserAssignments } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/my-assignments — any authenticated user
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  if (!user.id) throw BadRequest('User ID is required');
  return json({ success: true, data: await getUserAssignments(user.tenantId ?? null, user.id) });
});
