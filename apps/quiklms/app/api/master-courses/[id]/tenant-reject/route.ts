import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/tenant-reject — TENANT_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const { reason } = await parseBody(req, z.object({ reason: z.string().optional() }));
  const course = await svc.tenantReject(params!.id, actor.id, actor.tenantId, reason || 'No reason provided');
  return json({ success: true, data: course, message: 'Course rejected and sent back to Sub Admin' });
});
