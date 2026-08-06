import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAssessmentIncidents } from '@/lib/services/quiz-proctoring-service';

// GET /api/quiz-proctoring/assessment/:assessmentId/incidents — TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const incidents = await getAssessmentIncidents(actor, params!.assessmentId);
  return json({ success: true, data: incidents });
});
