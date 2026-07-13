import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { gradeSubmission, type GradeSubmissionInput } from '@/lib/services/homework-service';

const rubricScore = z.object({
  criterion: z.string(),
  maxScore: z.number().min(0),
  score: z.number().min(0),
  comment: z.string().optional(),
});

const schema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().optional(),
  correctedFileUrl: z.string().optional(),
  rubricScores: z.array(rubricScore).optional(),
  richFeedback: z.string().optional(),
});

// PATCH /api/homework/submissions/:id/grade — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await gradeSubmission(actor.orgId!, params!.id, actor.id, dto as GradeSubmissionInput));
});
