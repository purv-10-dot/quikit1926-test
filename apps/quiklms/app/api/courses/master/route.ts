import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createMasterCourse } from '@/lib/services/courses-service';

// POST /api/courses/master — SUPER_ADMIN (master courses are global, no orgId)
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const body = await parseBody(req, z.object({}).passthrough());
  const course = await createMasterCourse(actor.id, body as Record<string, unknown>);
  return json({ success: true, data: course, message: 'Master course created successfully' });
});
