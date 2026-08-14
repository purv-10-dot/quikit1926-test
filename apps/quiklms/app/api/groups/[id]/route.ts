import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOne, update, remove } from '@/lib/services/groups-service';

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
});

// GET /api/groups/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await findOne(user.orgId, params!.id) });
});

// PATCH /api/groups/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  const dto = await parseBody(req, updateSchema);
  return json({ success: true, data: await update(user.orgId, params!.id, dto) });
});

// DELETE /api/groups/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  await remove(user.orgId, params!.id);
  return json({ success: true, message: 'Group deleted successfully' });
});
