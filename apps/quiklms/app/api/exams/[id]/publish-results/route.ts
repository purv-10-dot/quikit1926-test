import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { publishResults } from '@/lib/services/exams-service';

// POST /api/exams/:id/publish-results — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const exam = await publishResults(actor, params!.id);
  return json({ success: true, data: exam });
});
