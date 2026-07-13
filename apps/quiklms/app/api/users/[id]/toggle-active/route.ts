import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { toggleActive } from '@/lib/services/users-service';

const schema = z.object({ isActive: z.boolean() });

// PATCH /api/users/:id/toggle-active — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { isActive } = await parseBody(req, schema);
  const orgId = actor.role === 'SUPER_ADMIN' ? undefined : actor.orgId ?? undefined;
  const data = await toggleActive(params!.id, orgId, isActive);
  return json({ success: true, data, message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
});
