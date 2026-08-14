import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { updateModuleOrder } from '@/lib/services/courses-service';

const schema = z.object({ moduleIds: z.array(z.string()) });

// PUT /api/courses/:id/modules/order — ADMIN | TENANT_ADMIN | SUB_ADMIN
//
// Authoring surface, not a learner one: reordering modules rewrites the
// learning sequence for everyone on the course. This was `requireAuth` only —
// out of step with every sibling course-mutation route — so any LEARNER could
// permanently restructure any course in their tenant.
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const { moduleIds } = await parseBody(req, schema);
  const course = await updateModuleOrder(actor.orgId, params!.id, moduleIds);
  return json({ success: true, data: course, message: 'Module order updated successfully' });
});
