import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getCurrentTerm } from '@/lib/services/academic-calendar-service';

// GET /api/academic-calendar/current-term — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  return json(await getCurrentTerm(actor.orgId));
});
