import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { submitQuiz, type SubmitQuizDto } from '@/lib/services/assessments-service';

const schema = z.object({
  assessmentId: z.string(),
  courseId: z.string(),
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        selectedAnswerIndex: z.number().optional(),
        textAnswer: z.string().optional(),
        matchAnswers: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
      }),
    )
    .default([]),
  sessionId: z.string().optional(),
});

// POST /api/assessments/submit — any authenticated user (TenantGuard)
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, schema);
  const result = await submitQuiz(actor.tenantId, actor.id, dto as SubmitQuizDto);
  return json({
    success: true,
    data: result,
    message: result.passed
      ? 'Congratulations! You passed the assessment.'
      : 'Assessment submitted. Please review and retry if needed.',
  });
});
