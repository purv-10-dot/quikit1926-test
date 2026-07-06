import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { addMembers } from '@/lib/services/groups-service';

const schema = z.object({ memberIds: z.array(z.string()) });

// POST /api/groups/:id/members — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.tenantId) throw BadRequest('Tenant ID is required');
  const dto = await parseBody(req, schema);
  return json({ success: true, data: await addMembers(user.tenantId, params!.id, dto) });
});
