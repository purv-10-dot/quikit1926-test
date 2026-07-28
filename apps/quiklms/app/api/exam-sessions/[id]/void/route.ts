import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { voidSession } from '@/lib/services/exam-sessions-service';

// POST /api/exam-sessions/:sessionId/void — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const result = await voidSession(actor, params!.id);
  return json({ success: true, data: result });
});
