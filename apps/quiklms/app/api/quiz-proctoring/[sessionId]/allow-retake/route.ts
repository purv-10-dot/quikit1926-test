import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { allowRetake } from '@/lib/services/quiz-proctoring-service';

// POST /api/quiz-proctoring/:sessionId/allow-retake — TENANT_ADMIN | SUB_ADMIN | MANAGER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const result = await allowRetake(actor, params!.sessionId);
  return json({ success: true, data: result });
});
