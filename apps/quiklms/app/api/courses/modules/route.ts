import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { addModule } from '@/lib/services/courses-service';

const schema = z.object({
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  orderIndex: z.number().optional(),
  assessmentId: z.string().optional(),
});

// POST /api/courses/modules — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, schema);
  const module = await addModule(actor.tenantId, dto);
  return json({ success: true, data: module, message: 'Module added successfully' });
});
