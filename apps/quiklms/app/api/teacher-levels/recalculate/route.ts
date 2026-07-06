import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { recalculateTenantLevels } from '@/lib/services/teacher-level-service';

// POST /api/teacher-levels/recalculate — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  await recalculateTenantLevels(actor.tenantId!);
  return json({ success: true, message: 'Recalculation completed' });
});
