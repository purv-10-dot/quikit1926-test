import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findTenant, updateTenant, removeTenant } from '@/lib/services/tenants-service';
import { z } from 'zod';

// GET /api/tenants/:id — SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  return json({ success: true, data: await findTenant(params!.id) });
});

// PATCH /api/tenants/:id — SUPER_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const dto = await parseBody(req, z.object({}).passthrough());
  const tenant = await updateTenant(params!.id, dto as Parameters<typeof updateTenant>[1]);
  return json({ success: true, data: tenant, message: 'Tenant updated successfully' });
});

// DELETE /api/tenants/:id — SUPER_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  await removeTenant(params!.id);
  return json({ success: true, message: 'Tenant deleted successfully' });
});
