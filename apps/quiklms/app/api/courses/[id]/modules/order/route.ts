import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateModuleOrder } from '@/lib/services/courses-service';

const schema = z.object({ moduleIds: z.array(z.string()) });

// PUT /api/courses/:id/modules/order — any authenticated user (TenantGuard)
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const { moduleIds } = await parseBody(req, schema);
  const course = await updateModuleOrder(actor.tenantId, params!.id, moduleIds);
  return json({ success: true, data: course, message: 'Module order updated successfully' });
});
