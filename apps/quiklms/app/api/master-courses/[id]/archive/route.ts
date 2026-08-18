import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/archive — ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const course = await svc.archive(actor, params!.id);
  return json({ success: true, data: course, message: 'Master course archived' });
});
