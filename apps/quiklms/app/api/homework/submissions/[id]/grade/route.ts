import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { gradeSubmission, type GradeSubmissionInput } from '@/lib/services/homework-service';
import { scoreField } from '@/lib/services/homework-schema';

const rubricScore = z.object({
  criterion: z.string().min(1, 'criterion is required'),
  maxScore: z.number().min(0),
  score: z.number().min(0),
  comment: z.string().optional(),
});

const schema = z.object({
  // No 100 ceiling here. The real bound is the homework's own `maxScore`, which
  // `gradeSubmission` checks against the loaded row — a hardcoded 100 made a
  // 150-point assignment ungradable while telling the teacher only
  // "Validation failed".
  score: scoreField,
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
