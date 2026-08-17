import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { addLesson } from '@/lib/services/courses-service';

// POST /api/courses/lessons — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, z.object({ moduleId: z.string() }).passthrough());
  const module = await addLesson(actor.orgId, dto as Record<string, unknown>);
  return json({ success: true, data: module, message: 'Lesson added successfully' });
});
