import { route, json, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { findOne } from '@/lib/services/payouts-service';

// GET /api/payouts/:id — staff/admin (TENANT_ADMIN | SUB_ADMIN | MANAGER) or the owning TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER']);
  const payout = await findOne(actor.orgId!, params!.id);
  // A TEACHER (without an admin/manager role) may only view their own payout.
  const isStaff = ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER'].some((r) =>
    userHasRole(actor, r as Parameters<typeof userHasRole>[1]),
  );
  if (!isStaff) {
    const teacher = (payout as { teacherId?: { id?: string } }).teacherId;
    if (teacher?.id !== actor.id) throw Forbidden('Access denied: you can only view your own payouts');
  }
  return json(payout);
});
