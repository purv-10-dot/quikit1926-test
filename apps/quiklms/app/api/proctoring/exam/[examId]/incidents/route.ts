import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getExamIncidents } from '@/lib/services/proctoring-service';

// GET /api/proctoring/exam/:examId/incidents — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const incidents = await getExamIncidents(actor, params!.examId);
  return json({ success: true, data: incidents });
});
