import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/publish — SUPER_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const { selectedTenants } = await parseBody(req, z.object({ selectedTenants: z.array(z.string()).optional() }));
  const course = await svc.publish(params!.id, selectedTenants ?? []);
  return json({ success: true, data: course, message: 'Master course published successfully' });
});
