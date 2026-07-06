import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createExam, findAllExams } from '@/lib/services/exams-service';

// POST /api/exams — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const body = await parseBody(req, z.object({}).passthrough());
  const exam = await createExam(actor, actor.id, body as Record<string, unknown>);
  return json({ success: true, data: exam });
});

// GET /api/exams?batchId=&status=&subject= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const url = new URL(req.url);
  const exams = await findAllExams(actor, {
    batchId: url.searchParams.get('batchId') || undefined,
    status: url.searchParams.get('status') || undefined,
    subject: url.searchParams.get('subject') || undefined,
  });
  return json({ success: true, data: exams });
});
