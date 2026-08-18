import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// PUT /api/master-courses/:id/reorder-modules — ADMIN | TENANT_ADMIN | SUB_ADMIN
// Ownership guard is a deliberate behavior change (approved 2026-07-17): without
// it any tenant admin could restructure any tenant's master course.
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  const { moduleIds } = await parseBody(req, z.object({ moduleIds: z.array(z.string()) }));
  const course = await svc.reorderModules(params!.id, moduleIds);
  return json({ success: true, data: course, message: 'Modules reordered successfully' });
});
