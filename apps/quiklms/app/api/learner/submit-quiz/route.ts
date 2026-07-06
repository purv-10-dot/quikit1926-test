import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { submitQuiz, type SubmitQuizDto } from '@/lib/services/assessments-service';
import { generateCertificateForCompletion } from '@/lib/services/certificates-service';

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

// POST /api/learner/submit-quiz
// Grades the quiz via the assessments engine (tenant-scoped), persists progress,
// and best-effort issues a completion certificate when the gate is met.
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  if (!user.tenantId || !user.id) {
    return json({ success: false, message: 'Tenant ID and Learner ID are required' }, 400);
  }

  const dto = await parseBody(req, schema);
  const result = await submitQuiz(user.tenantId, user.id, dto as SubmitQuizDto);

  // Best-effort certificate issuance once the learner has passed and completed.
  if (result.passed) {
    try {
      await generateCertificateForCompletion(user.tenantId, user.id, dto.courseId);
    } catch {
      /* certificate issuance is best-effort; grading already succeeded */
    }
  }

  return json({
    success: true,
    data: result,
    message: result.passed
      ? 'Congratulations! You passed the assessment.'
      : 'Assessment submitted. Please review and retry if needed.',
  });
});
