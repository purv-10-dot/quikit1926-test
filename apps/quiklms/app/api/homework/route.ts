import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create, type CreateHomeworkInput } from '@/lib/services/homework-service';

const resourceLink = z.object({ url: z.string(), label: z.string().optional() });

const schema = z.object({
  title: z.string(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  batchId: z.string(),
  attachmentUrls: z.array(z.string()).optional(),
  resourceLinks: z.array(resourceLink).optional(),
  dueDate: z.string(),
  assignedToStudentIds: z.array(z.string()).optional(),
  maxScore: z.number().min(0).max(100).optional(),
  allowLateSubmission: z.boolean().optional(),
  lateSubmissionDeadline: z.string().optional(),
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
