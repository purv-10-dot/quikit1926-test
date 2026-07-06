import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateLessonOrder } from '@/lib/services/courses-service';

const schema = z.object({ lessonIndices: z.array(z.number()) });

// PUT /api/courses/modules/:moduleId/lessons/order — any authenticated user (TenantGuard)
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const { lessonIndices } = await parseBody(req, schema);
  const module = await updateLessonOrder(actor.tenantId, params!.moduleId, lessonIndices);
  return json({ success: true, data: module, message: 'Lesson order updated successfully' });
});
