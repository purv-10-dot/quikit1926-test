import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createExam, findAllExams } from '@/lib/services/exams-service';

/** One entry of `exam.questions[]` — a reference into the question bank. */
const examQuestionRef = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  points: z.number().optional(),
  order: z.number().optional(),
});

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `LmsExam.title` and `LmsExam.duration` are the only two columns with neither
 * a default nor a nullable type, and `createExam` forwards both unguarded — so
 * `POST {}` reached Prisma with `title: undefined` and answered **500** for
 * what is plainly a client fault. Every other field carries a DB default or is
 * optional, so all of them stay optional here. Unknown keys are stripped, not
 * rejected: `createExam` reads named fields only, so stripping is exactly the
 * behaviour a stray key already gets.
 */
const createExamSchema = z.object({
  title: z.string().min(1, 'title is required'),
  duration: z.number().int('duration must be a whole number of minutes'),
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
  // The client sends `new Date(...)`, which serialises to an ISO string.
  scheduledStartTime: z.union([z.string(), z.number(), z.date()]).nullish(),
  scheduledEndTime: z.union([z.string(), z.number(), z.date()]).nullish(),
});

// POST /api/exams — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const body = await parseBody(req, createExamSchema);
  const exam = await createExam(actor, actor.id, body as Record<string, unknown>);
  return json({ success: true, data: exam }, 201);
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
