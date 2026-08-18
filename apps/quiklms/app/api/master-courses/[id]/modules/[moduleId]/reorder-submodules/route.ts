import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// PUT /api/master-courses/:id/modules/:moduleId/reorder-submodules — ADMIN | TENANT_ADMIN | SUB_ADMIN
// Ownership guard is a deliberate behavior change (approved 2026-07-17).
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  const { subModuleIds } = await parseBody(req, z.object({ subModuleIds: z.array(z.string()) }));
  const course = await svc.reorderSubModules(params!.id, params!.moduleId, subModuleIds);
  return json({ success: true, data: course, message: 'Sub-modules reordered successfully' });
});
