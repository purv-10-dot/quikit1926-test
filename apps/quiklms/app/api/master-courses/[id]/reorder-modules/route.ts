import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// PUT /api/master-courses/:id/reorder-modules — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { moduleIds } = await parseBody(req, z.object({ moduleIds: z.array(z.string()) }));
  const course = await svc.reorderModules(params!.id, moduleIds);
  return json({ success: true, data: course, message: 'Modules reordered successfully' });
});
