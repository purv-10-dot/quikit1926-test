import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getSessionLog } from '@/lib/services/proctoring-service';

// GET /api/proctoring/:sessionId/log — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const logs = await getSessionLog(actor, params!.sessionId);
  return json({ success: true, data: logs });
});
