import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAllIncidents } from '@/lib/services/quiz-proctoring-service';

// GET /api/quiz-proctoring/incidents/all — TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const incidents = await getAllIncidents(actor);
  return json({ success: true, data: incidents });
});
