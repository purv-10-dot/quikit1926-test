import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create, findAll } from '@/lib/services/groups-service';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

// POST /api/groups — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  const dto = await parseBody(req, createSchema);
  const group = await create(user.orgId, user.id, dto);
  return json({ success: true, data: group });
});

// GET /api/groups — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await findAll(user.orgId) });
});
