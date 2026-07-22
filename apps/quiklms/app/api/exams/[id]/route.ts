import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOneExam, updateExam } from '@/lib/services/exams-service';

/** One entry of `exam.questions[]` — a reference into the question bank. */
const examQuestionRef = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  points: z.number().optional(),
  order: z.number().optional(),
});

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Same fields as
 * `POST /api/exams`, all optional — `updateExam` applies each one only
 * `if (data.x !== undefined)`.
 *
 * `batchId` is the exception to that rule and must stay declared even though it
 * is optional: the service reads it UNCONDITIONALLY
 * (`update.batch = data.batchId ? connect : disconnect`), so omitting it
 * detaches the batch. Stripping it out of the schema would silently unlink
 * every exam from its batch on save.
 */
const updateExamSchema = z.object({
  title: z.string().optional(),
  duration: z.number().int('duration must be a whole number of minutes').optional(),
  description: z.string().nullish(),
  instructions: z.string().nullish(),
  subject: z.string().nullish(),
  batchId: z.string().nullish(),
  totalMarks: z.number().optional(),
  questionSelectionMode: z.enum(['manual', 'auto_random']).optional(),
  autoSelectRules: z.record(z.unknown()).nullish(),
  questions: z.array(examQuestionRef).optional(),
  settings: z.record(z.unknown()).nullish(),
  proctoringLevel: z.enum(['none', 'soft']).optional(),
  scheduledStartTime: z.union([z.string(), z.number(), z.date()]).nullish(),
  scheduledEndTime: z.union([z.string(), z.number(), z.date()]).nullish(),
});

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
  const body = await parseBody(req, updateExamSchema);
  const exam = await updateExam(actor, params!.id, body as Record<string, unknown>);
  return json({ success: true, data: exam });
});
