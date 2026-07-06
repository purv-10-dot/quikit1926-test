import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOneExam, updateExam } from '@/lib/services/exams-service';

// GET /api/exams/:id — TENANT_ADMIN | SUB_ADMIN | TEACHER | LEARNER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER', 'LEARNER']);
  const exam = await findOneExam(actor, params!.id);
  return json({ success: true, data: exam });
});

// PUT /api/exams/:id — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const body = await parseBody(req, z.object({}).passthrough());
  const exam = await updateExam(actor, params!.id, body as Record<string, unknown>);
  return json({ success: true, data: exam });
});
