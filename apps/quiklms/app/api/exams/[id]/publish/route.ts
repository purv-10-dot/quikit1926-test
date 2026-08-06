import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { publishExam } from '@/lib/services/exams-service';

// POST /api/exams/:id/publish — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const exam = await publishExam(actor, params!.id);
  return json({ success: true, data: exam });
});
