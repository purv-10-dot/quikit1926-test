import { z } from 'zod';
import { route, json } from '@/lib/http';
import { dateField, parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create, type CreateHomeworkInput } from '@/lib/services/homework-service';
import { maxScoreField, resourceLink } from '@/lib/services/homework-schema';

const schema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  instructions: z.string().optional(),
  batchId: z.string().min(1, 'batchId is required'),
  attachmentUrls: z.array(z.string().min(1)).optional(),
  resourceLinks: z.array(resourceLink).optional(),
  // Required AND parseable — a blank date input used to reach Prisma as an
  // Invalid Date and fail the whole create with no field named. See `dateField`.
  dueDate: dateField,
  assignedToStudentIds: z.array(z.string()).optional(),
  maxScore: maxScoreField.optional(),
  allowLateSubmission: z.boolean().optional(),
  lateSubmissionDeadline: dateField.optional(),
  // A PERCENT, so 0-100 is the right domain here — unlike `maxScore`.
  latePenaltyPercent: z.number().min(0).max(100).optional(),
  type: z.enum(['assignment', 'quiz', 'project', 'reading']).optional(),
});

// POST /api/homework — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await create(actor.orgId!, actor.id, dto as CreateHomeworkInput));
});
