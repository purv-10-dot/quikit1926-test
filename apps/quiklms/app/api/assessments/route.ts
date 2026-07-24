import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create } from '@/lib/services/assessments-service';

/**
 * `''`/`null` → absent, numeric strings → numbers, anything else untouched.
 *
 * `QuizCreator` registers every numeric input on react-hook-form WITHOUT
 * `valueAsNumber` (`passingScore`, `retryLimit`, `timeLimit`, `questionsToShow`,
 * `additionalQuestionsToInclude`, and the True/False `correctAnswerIndex`
 * `<select>`), so an edited field arrives as the STRING `"80"` while an
 * untouched one keeps its numeric default `80`, and a cleared one arrives as
 * `''`. A bare `z.number()` would 400 on every quiz the author actually typed
 * into, so coerce instead — and treat `''` as "not supplied" rather than `0`.
 */
const toNumber = (v: unknown): unknown => {
  if (v === '' || v === null) return undefined;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }
  return v;
};

const numberField = (inner: z.ZodNumber) => z.preprocess(toNumber, inner.optional());
const indexField = z.preprocess(toNumber, z.number().int().min(0));

/**
 * Port of the legacy `QuestionDto` (`assessments/dto/create-assessment.dto.ts`).
 *
 * Two deliberate widenings of the class-validator original:
 *  - `type` was `@IsEnum(QuestionType)` (MCQ | True/False). This app authors and
 *    grades more kinds than that — `mapQuizQuestion` emits MultiSelect,
 *    FillBlank and Match — and the API fixtures omit `type` entirely, so it
 *    stays an optional string rather than a hard enum.
 *  - `.passthrough()`, because a question document carries per-type extras the
 *    grader reads back off the stored JSON (`blanks`, `dragDropPairs`,
 *    `imageUrl`, `audioUrl` — see `submitQuiz`). Stripping them would silently
 *    break those question types.
 */
const questionSchema = z
  .object({
    text: z.string().min(1),
    type: z.string().optional(),
    // `@IsArray() @ArrayMinSize(2)`. Object options (`{ text, isCorrect }`) also
    // occur in this app's stored question documents (see `redactAnswerKey`), so
    // they are accepted rather than 400'd.
    options: z.array(z.union([z.string(), z.record(z.unknown())])).min(2),
    // `IsNumberOrNumberArrayConstraint`: a number (single select) or a non-empty
    // array of numbers (multi-select), all >= 0.
    correctAnswerIndex: z.union([indexField, z.array(indexField).min(1)]),
    explanation: z.string().nullish(),
    points: numberField(z.number().min(0)),
  })
  .passthrough();

/**
 * Real schema for `CreateAssessmentDto`, replacing
 * `z.object({ moduleId: z.string() }).passthrough()` — a near-no-op that let a
 * non-UI caller persist an assessment with an empty title, no questions, or a
 * `passingScore` of 500. Mirrors the PUT sibling's typed-schema style
 * (`app/api/assessments/[id]/route.ts`); unknown top-level keys are stripped
 * rather than rejected, matching the legacy ValidationPipe whitelist.
 *
 * `questions` is `.min(1)`: the legacy `@IsArray()` made the field required but
 * tolerated `[]`, and a zero-question assessment grades every attempt at 0%
 * (`totalPoints === 0`), which fails the learner and blocks the certificate.
 * Both real callers already refuse to send an empty bank.
 */
const createAssessmentSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().min(1),
  questions: z.array(questionSchema).min(1),
  passingScore: numberField(z.number().min(0).max(100)),
  retryLimit: numberField(z.number().min(0)),
  timeLimit: numberField(z.number().min(0)),
  randomizeQuestions: z.boolean().optional(),
  questionsToShow: numberField(z.number().min(1)),
  additionalQuestions: z.array(questionSchema).optional(),
  additionalQuestionsToInclude: numberField(z.number().min(1)),
  isMaster: z.boolean().optional(),
});

// POST /api/assessments — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | TEACHER
// Authoring a quiz is staff work; this was `requireAuth` only, so any LEARNER
// could create assessments in their tenant.
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, createAssessmentSchema);
  const assessment = await create(actor.orgId, dto as Record<string, unknown>);
  return json({ success: true, data: assessment, message: 'Assessment created successfully' });
});
