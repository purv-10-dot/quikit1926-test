import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getBalanceByParent, getStudentBalance } from '@/lib/services/credits-service';

// GET /api/credits/my-balance — PARENT | LEARNER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'LEARNER']);
  if (actor.role === 'PARENT') {
    return json(await getBalanceByParent(actor.tenantId!, actor.id));
  }
  return json(await getStudentBalance(actor.tenantId!, actor.id));
});
