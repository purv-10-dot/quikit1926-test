import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, requireQuizProctoring } from '@/lib/auth/context';
import { getSessionLog } from '@/lib/services/quiz-proctoring-service';

// GET /api/quiz-proctoring/:sessionId/log — TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);

  await requireQuizProctoring(actor);
  const logs = await getSessionLog(actor, params!.sessionId);
  return json({ success: true, data: logs });
});
