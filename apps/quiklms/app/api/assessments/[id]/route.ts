import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import {
  findOne,
  update,
  redactAnswerKey,
  shouldRedactAnswerKey,
} from '@/lib/services/assessments-service';
import { getSessionManifest } from '@/lib/services/quiz-proctoring-service';

/**
 * GET /api/assessments/:id?sessionId= — any authenticated user (TenantGuard)
 *
 * When `sessionId` is supplied, the response is sliced to the exact question
 * subset that proctoring session locked in at start, and the raw
 * `additionalQuestions` pool is removed from the wire. 1:1 port of
 * `AssessmentsController.findOne` (`assessments.controller.ts:58-77`).
 *
 * This route previously IGNORED `sessionId` and returned the full row, on the
 * stated grounds that the quiz-proctoring module was "not ported". That rationale
 * was stale — `lib/services/quiz-proctoring-service.ts` exists and is what serves
 * the manifest. The consequence was a live answer-key leak (GAP_REPORT §2.4):
 * proctored learners received `correctAnswerIndex` for every question plus the
 * entire bonus pool. Strictly worse than the original.
 *
 * The session's chosen indices persist, so a mid-attempt refresh yields the same
 * questions. With no session context the full assessment is returned, matching
 * the legacy no-session branch.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const assessment = await findOne(params!.id, actor.orgId);

  // ANSWER-KEY REDACTION. Applies on BOTH branches below. The slicing path
  // narrows *which* questions are returned; it never removed the answers, so a
  // proctored learner still received `correctAnswerIndex` for the questions they
  // were about to be marked on. Staff keep the key — they author and grade.
  const redact = shouldRedactAnswerKey(actor.role);

  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (sessionId) {
    const manifest = await getSessionManifest(sessionId);
    if (manifest && manifest.length > 0) {
      const row = assessment as unknown as Record<string, unknown>;
      const main = (row.questions as unknown[]) || [];
      const additional = (row.additionalQuestions as unknown[]) || [];

      // Out-of-range entries are dropped, exactly as the legacy `.filter(q => q !== null)`.
      const subset = manifest
        .map((entry) => {
          const pool = entry.pool === 'additional' ? additional : main;
          return entry.index >= 0 && entry.index < pool.length ? pool[entry.index] : null;
        })
        .filter((q) => q !== null);

      const data: Record<string, unknown> = { ...row, questions: subset };
      // Hide the raw additional pool — the learner sees only the combined list.
      delete data.additionalQuestions;
      return json({ success: true, data: redact ? redactAnswerKey(data) : data });
    }
  }

  return json({ success: true, data: redact ? redactAnswerKey(assessment) : assessment });
});

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `update()` strips only `id`/`orgId`/`createdAt`/`updatedAt` and hands the rest
 * to `prisma.lmsAssessment.update`, so any other stray key arrived as an unknown
 * Prisma argument and a wrong-typed `passingScore` died in Postgres. The field
 * list is `LmsAssessment`'s writable columns; unknown keys are stripped rather
 * than rejected, which is more forgiving than the fault they cause today.
 *
 * Every field is optional — this is a partial edit, and `QuizCreator` omits
 * `questionsToShow`/`additionalQuestionsToInclude` whenever randomisation is
 * off. `questions` and `additionalQuestions` stay opaque arrays: they are
 * embedded `Json` question documents whose per-type shape (MCQ vs True/False,
 * with or without `correctAnswerIndex`) lives in the quiz UI, not the database.
 */
const updateAssessmentSchema = z.object({
  title: z.string().optional(),
  moduleId: z.string().optional(),
  questions: z.array(z.unknown()).optional(),
  passingScore: z.number().optional(),
  retryLimit: z.number().int().optional(),
  timeLimit: z.number().int().nullish(),
  randomizeQuestions: z.boolean().optional(),
  questionsToShow: z.number().int().nullish(),
  additionalQuestions: z.array(z.unknown()).optional(),
  additionalQuestionsToInclude: z.number().int().nullish(),
  isMaster: z.boolean().optional(),
});

// PUT /api/assessments/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN | TEACHER
//
// Authoring, not consumption. This was `requireAuth` only, so a LEARNER could
// rewrite an assessment they were about to sit — including `correctAnswerIndex`
// and `passingScore` — for every other learner on it.
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const updateData = await parseBody(req, updateAssessmentSchema);
  const assessment = await update(params!.id, actor.orgId, updateData as Record<string, unknown>);
  return json({ success: true, data: assessment, message: 'Assessment updated successfully' });
});
