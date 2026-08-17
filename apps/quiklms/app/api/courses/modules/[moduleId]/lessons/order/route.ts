import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { updateLessonOrder } from '@/lib/services/courses-service';

const schema = z.object({ lessonIndices: z.array(z.number()) });

// PUT /api/courses/modules/:moduleId/lessons/order — ADMIN | TENANT_ADMIN | SUB_ADMIN
// Same reasoning as the module-order route: authoring, not consumption.
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const { lessonIndices } = await parseBody(req, schema);
  const module = await updateLessonOrder(actor.orgId, params!.moduleId, lessonIndices);
  return json({ success: true, data: module, message: 'Lesson order updated successfully' });
});
