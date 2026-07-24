import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/reject — SUPER_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const { reason } = await parseBody(req, z.object({ reason: z.string().optional() }));
  const course = await svc.reject(params!.id, actor.id, reason || 'No reason provided');
  return json({ success: true, data: course, message: 'Course rejected' });
});
