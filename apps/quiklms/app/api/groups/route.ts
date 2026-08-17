import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create, findAll } from '@/lib/services/groups-service';

// Upper bounds matter as much as lower ones: `name` had `.min(1)` and no
// `.max()`, so a 100,000-character name was accepted and persisted. Unbounded
// text columns are a storage and render-cost problem (every list view that
// shows the name pays for it), and the caller gets no useful error either way.
const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  memberIds: z.array(z.string()).max(10_000).optional(),
});

// POST /api/groups — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  const dto = await parseBody(req, createSchema);
  const group = await create(user.orgId, user.id, dto);
  return json({ success: true, data: group });
});

// GET /api/groups — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await findAll(user.orgId) });
});
