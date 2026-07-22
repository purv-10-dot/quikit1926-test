import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { submitQuiz, type SubmitQuizDto } from '@/lib/services/assessments-service';
import { syncProgress } from '@/lib/services/progress-service';
import {
  generateCertificateForCompletion,
  getLearnerCertificates,
  getPresignedDownloadUrl,
} from '@/lib/services/certificates-service';

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

/**
 * POST /api/learner/submit-quiz — port of `LearnerController.submitQuiz`
 * (`learner.controller.ts:66-170`).
 *
 * THREE THINGS WERE MISSING (GAP_REPORT priority #19):
 *
 * 1. **The course-level re-sync.** The original calls `syncProgress` right after
 *    grading, passing the quiz score as `completionPercentage` and the lesson as
 *    Completed, so the course's weighted average, lifecycle status and
 *    certificate trigger are re-evaluated. `assessments.submitQuiz` only writes
 *    the QUIZ's own score and leaves `status: 'InProgress'` — so without this
 *    call, **finishing a course's last quiz never completed the course**, and
 *    therefore never issued a certificate.
 *
 * 2. **The certificate gate.** The port gated on `result.passed`. The original
 *    gates on `completionPercentage >= 100` and says so explicitly: *"Generate
 *    certificate if course is completed (quiz pass/fail doesn't block this)"*
 *    (`:109`). Gating on `passed` is wrong in both directions.
 *
 * 3. **`attemptsRemaining` and `certificateUrl`** were absent from the response.
 *    The client declares `certificateUrl` on its payload type
 *    (`components/learner/InteractiveQuizComponent.tsx:82`), so it was always
 *    reading undefined.
 */
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  if (!user.orgId || !user.id) {
    return json({ success: false, message: 'Tenant ID and Learner ID are required' }, 400);
  }

  const dto = await parseBody(req, schema);
  const result = await submitQuiz(user.orgId, user.id, dto as SubmitQuizDto);

  // Re-sync at COURSE level so completion/overdue lifecycle and the certificate
  // trigger are evaluated immediately. The quiz lesson is complete once
  // attempted; its score feeds the weighted course average.
  let recalculated: { completionPercentage?: number } | null = null;
  try {
    recalculated = await syncProgress({
      orgId: user.orgId,
      learnerId: user.id,
      courseId: dto.courseId,
      lessonId: dto.assessmentId,
      completionPercentage: result.percentage,
      status: 'Completed',
    });
  } catch {
    /* grading already succeeded — never fail the submission on a sync error */
  }

  // `attemptsRemaining` comes from submitQuiz, which is where the retryLimit
  // cap is enforced. Re-deriving it here is what made the author's maxAttempts
  // setting look broken — see the note on the service's return value.
  const attemptsRemaining = result.attemptsRemaining;

  // Certificate: issued on COURSE COMPLETION, not on passing this quiz.
  let certificateUrl: string | null = null;
  if (recalculated) {
    try {
      const findForCourse = (certs: Awaited<ReturnType<typeof getLearnerCertificates>>) =>
        certs.find((c) => {
          const cid = c.courseId as { _id?: string } | string | null;
          const id = cid && typeof cid === 'object' ? cid._id : cid;
          return String(id) === dto.courseId;
        });

      let certificates = await getLearnerCertificates(user.orgId, user.id);
      let courseCertificate = findForCourse(certificates);

      if (!courseCertificate && (recalculated.completionPercentage ?? 0) >= 100) {
        try {
          await generateCertificateForCompletion(user.orgId, user.id, dto.courseId);
          certificates = await getLearnerCertificates(user.orgId, user.id);
          courseCertificate = findForCourse(certificates);
        } catch {
          /* certificate issuance is best-effort; grading already succeeded */
        }
      }

      /**
       * Fallback ladder, as the legacy had it (`learner.controller.ts:151-168`):
       * presigned link → stored pdfUrl → verificationUrl. The last rung sits
       * OUTSIDE the pdfUrl guard, so a certificate with no PDF yet still returns
       * its verification link. Only presigning when `pdfUrl` was set, and
       * swallowing failure to `null`, meant a learner who completed the course
       * got `certificateUrl: null` and no link at all whenever S3 presigning
       * failed — even though the certificate existed.
       */
      if (courseCertificate) {
        if (courseCertificate.pdfUrl) {
          certificateUrl = await getPresignedDownloadUrl(courseCertificate.id, user.orgId, user.id).catch(() => null);
          if (!certificateUrl) certificateUrl = courseCertificate.pdfUrl;
        }
        if (!certificateUrl) certificateUrl = courseCertificate.verificationUrl ?? null;
      }
    } catch {
      /* never fail the submission over the certificate lookup */
    }
  }

  return json({
    success: true,
    data: { ...result, attemptsRemaining, certificateUrl },
    // Don't invite a retry the backend will reject, and don't deny one it would
    // allow. `attemptsRemaining` now reflects the author's retryLimit:
    //   null -> unlimited (retryLimit <= 0), >0 -> retries left, 0 -> exhausted.
    message: result.passed
      ? 'Congratulations! You passed the assessment.'
      : attemptsRemaining === null || attemptsRemaining > 0
        ? 'Assessment submitted. Please review and retry if needed.'
        : 'Assessment submitted. You have used all attempts for this quiz.',
  });
});
