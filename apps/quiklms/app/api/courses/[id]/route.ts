import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findOne } from '@/lib/services/courses-service';

// GET /api/courses/:id — any authenticated user (tenant-scoped)
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await findOne(params!.id, actor.tenantId);
  return json({ success: true, data });
});
