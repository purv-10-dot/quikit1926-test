/**
 * Assessments service — ported from AssessmentsService (Prisma).
 *
 * Assessments live in two places: standalone `Assessment` rows, and quizzes
 * embedded inside MasterCourse.modules JSON (subModule.quiz / moduleEndQuiz).
 * findOne resolves both. Scoring + progress/QuizAttempt writes are ported.
 *
 * Quiz-proctoring session manifests ARE wired: `getSessionManifest`
 * (`lib/services/quiz-proctoring-service.ts`, Prisma-backed) is used to slice
 * questions to the subset the proctoring session locked in, both when serving
 * `findOne(..., sessionId)` and when scoring `submitQuiz`, so a randomized
 * attempt is graded against exactly the questions it was shown. When no
 * sessionId is supplied the full question set is used.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/http';
import { getSessionManifest } from '@/lib/services/quiz-proctoring-service';

type AnyRec = Record<string, unknown>;


/**
 * Fields on an embedded question that reveal the answer. Kept in one place so
 * the redaction below and any future question shape stay in step.
 */
const ANSWER_KEY_FIELDS = [
  'correctAnswerIndex',
  'correctAnswer',
  'correctAnswers',
  'explanation',
] as const;

/**
 * Remove the answer key from an assessment before it reaches a learner.
 *
 * WHY: `GET /api/assessments/:id` is the endpoint the quiz UI calls immediately
 * BEFORE an attempt, and it returned `correctAnswerIndex` on every question —
 * the answers were sitting in the browser payload. The exam surface has always
 * done this correctly (`exams-service.stripAnswerKey`); the assessment surface
 * simply had no counterpart, which is why one leaked and the other did not.
 *
 * Option TEXT is preserved — the learner has to see the choices — and only the
 * marker of which one is right is dropped. `options` may be plain strings or
 * `{ text, isCorrect }` objects depending on how the quiz was authored, so both
 * shapes are handled.
 *
 * Staff keep the full payload: authors and graders need the key to edit and
 * mark. Callers decide via `shouldRedactAnswerKey(actor)`.
 */
export function redactAnswerKey(assessment: AnyRec): AnyRec {
  const scrubQuestion = (q: unknown): unknown => {
    if (!q || typeof q !== 'object') return q;
    const row = { ...(q as AnyRec) };
    for (const f of ANSWER_KEY_FIELDS) delete row[f];

    if (Array.isArray(row.options)) {
      row.options = row.options.map((o) => {
        if (!o || typeof o !== 'object') return o; // plain string option
        const { isCorrect: _ic, correct: _c, ...safe } = o as AnyRec;
        return safe;
      });
    }
    return row;
  };

  const out: AnyRec = { ...assessment };
  if (Array.isArray(out.questions)) out.questions = out.questions.map(scrubQuestion);
  if (Array.isArray(out.additionalQuestions)) {
    out.additionalQuestions = out.additionalQuestions.map(scrubQuestion);
  }
  return out;
}

/** Staff author and grade, so they keep the key; everyone else must not see it. */
export function shouldRedactAnswerKey(role: string, secondaryRole?: string | null): boolean {
  const staff = ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER'];
  return !staff.includes(role) && !(secondaryRole && staff.includes(secondaryRole));
}

export async function create(orgId: string, dto: AnyRec) {
  const normalisePoints = (q: AnyRec) => ({ ...q, points: q.points || 1 });
  const questions = ((dto.questions as AnyRec[]) || []).map(normalisePoints);
  const additionalQuestions = ((dto.additionalQuestions as AnyRec[]) || []).map(normalisePoints);

  return db.lmsAssessment.create({
    data: {
      orgId,
      moduleId: String(dto.moduleId),
      title: String(dto.title ?? ''),
      questions: questions as unknown as Prisma.InputJsonValue,
      additionalQuestions: additionalQuestions as unknown as Prisma.InputJsonValue,
      passingScore: typeof dto.passingScore === 'number' ? (dto.passingScore as number) : 80,
      retryLimit: typeof dto.retryLimit === 'number' ? (dto.retryLimit as number) : 3,
      timeLimit: typeof dto.timeLimit === 'number' ? (dto.timeLimit as number) : undefined,
      randomizeQuestions: dto.randomizeQuestions === true,
      questionsToShow: typeof dto.questionsToShow === 'number' ? (dto.questionsToShow as number) : undefined,
      additionalQuestionsToInclude:
        typeof dto.additionalQuestionsToInclude === 'number' ? (dto.additionalQuestionsToInclude as number) : undefined,
      isMaster: dto.isMaster === true,
    },
  });
}

/** Find an assessment by id (standalone Assessment row, else master-course quiz). */
export async function findOne(id: string, orgId: string): Promise<AnyRec> {
  const standalone = await db.lmsAssessment.findFirst({ where: { id, orgId } });
  if (standalone) return standalone as unknown as AnyRec;

  // Search master-course embedded quizzes by quiz id.
  //
  // The legacy did `masterCourseModel.find({})` — every master course, with its
  // entire nested `modules` tree — on EVERY quiz load and again on every
  // proctoring session start. `modules` holds all sub-modules, resources and
  // question banks, so that is the single heaviest read in the quiz path, and
  // it grows with the whole catalogue rather than with the one quiz wanted.
  // Narrow it to the owning course with a jsonb path probe first; the walk
  // below then runs over one row instead of the table.
  for (const course of await findCoursesContainingQuiz(id)) {
    const modules = (course.modules as unknown as AnyRec[]) || [];
    for (const module of modules) {
      for (const subModule of (module.subModules as AnyRec[]) || []) {
        const quiz = subModule.quiz as AnyRec | undefined;
        if (quiz && quiz.id === id) return transformMasterQuiz(id, orgId, quiz, 'Quiz');
      }
      const endQuiz = module.moduleEndQuiz as AnyRec | undefined;
      if (endQuiz && endQuiz.id === id) return transformMasterQuiz(id, orgId, endQuiz, 'Module Quiz');
    }
  }

  throw NotFound(`Assessment with ID ${id} not found`);
}

/**
 * Master courses whose `modules` tree embeds a quiz with this id — normally
 * exactly one.
 *
 * Falls back to loading every course if the probe throws, so a jsonb/permission
 * surprise degrades to the old (slow but correct) behaviour rather than making
 * every quiz in the product unopenable.
 */
async function findCoursesContainingQuiz(quizId: string): Promise<{ modules: unknown }[]> {
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM app_quiklms.master_courses
      WHERE jsonb_path_exists(modules, '$[*].subModules[*].quiz.id ? (@ == $q)', jsonb_build_object('q', ${quizId}::text))
         OR jsonb_path_exists(modules, '$[*].moduleEndQuiz.id ? (@ == $q)', jsonb_build_object('q', ${quizId}::text))
      LIMIT 1
    `;
    if (rows.length === 0) return [];
    return db.lmsMasterCourse.findMany({
      where: { id: rows[0].id },
      select: { modules: true },
    });
  } catch {
    return db.lmsMasterCourse.findMany({ select: { modules: true } });
  }
}

function transformMasterQuiz(id: string, orgId: string, quiz: AnyRec, fallbackTitle: string): AnyRec {
  const settings = (quiz.settings as AnyRec) || {};
  const mapped = ((quiz.questions as AnyRec[]) || []).map(mapQuizQuestion);
  const mappedAdditional = ((quiz.additionalQuestions as AnyRec[]) || []).map(mapQuizQuestion);
  return {
    _id: id,
    originalId: id,
    orgId,
    moduleId: '',
    title: quiz.title || fallbackTitle,
    questions: mapped,
    additionalQuestions: mappedAdditional,
    additionalQuestionsToInclude: settings.additionalQuestionsToInclude,
    randomizeQuestions: !!settings.randomizeQuestions,
    questionsToShow: settings.questionsToShow,
    passingScore: settings.passingScore || 80,
    retryLimit: settings.maxAttempts || 3,
    timeLimit: settings.timeLimit,
    isMaster: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function update(id: string, orgId: string, updateData: AnyRec) {
  const existing = await db.lmsAssessment.findFirst({ where: { id, orgId } });
  if (!existing) throw NotFound('Assessment not found');
  const { id: _id, orgId: _t, createdAt: _ca, updatedAt: _ua, ...rest } = updateData;
  return db.lmsAssessment.update({ where: { id }, data: rest as Prisma.LmsAssessmentUpdateInput });
}

/** Prior submitted attempts for retry-limit enforcement. */
async function countLearnerAttempts(orgId: string, learnerId: string, courseId: string, assessmentId: string): Promise<number> {
  const attempts = await getQuizAttempts(orgId, learnerId, assessmentId);
  if (attempts.length > 0) return attempts.length;

  // For UUID/master assessments we don't persist QuizAttempt rows; use
  // lessonProgress as a "1 prior attempt" signal.
  const progress = await db.lmsProgress.findFirst({ where: { orgId, learnerId, courseId } });
  const lp = (progress?.lessonProgress as AnyRec | null) || undefined;
  if (!lp) return 0;
  const isDone = (v: AnyRec) => v && (v.isCompleted === true || (Number(v.completionPercentage) || 0) >= 95);
  if (isDone(lp[assessmentId] as AnyRec)) return 1;
  for (const v of Object.values(lp)) {
    const entry = v as AnyRec;
    if (isDone(entry) && entry?.lessonId === assessmentId) return 1;
  }
  return 0;
}

export async function getQuizAttempts(orgId: string, learnerId: string, assessmentId: string) {
  if (!orgId || !learnerId || !assessmentId) return [];
  // NOTE: this used to bail on `UUID_RE.test(assessmentId)`, on the theory that
  // a UUID meant a master-course quiz. That is backwards — `LmsAssessment.id`
  // is `@default(uuid())`, so EVERY standalone assessment is a UUID and the
  // guard discarded exactly the attempts it was meant to return. Attempt
  // history was therefore always empty, which also made `retryLimit`
  // unenforceable. Querying by (orgId, learnerId, assessmentId) is safe for
  // master-quiz ids too: they simply match no rows.
  return db.lmsQuizAttempt.findMany({
    where: { orgId, learnerId, assessmentId },
    orderBy: { submittedAt: 'desc' },
  });
}

export interface SubmitQuizDto {
  assessmentId: string;
  courseId: string;
  answers: Array<{ questionId: string; selectedAnswerIndex?: number; textAnswer?: string; matchAnswers?: Array<{ left: string; right: string }> }>;
  sessionId?: string;
}

export async function submitQuiz(orgId: string, learnerId: string, dto: SubmitQuizDto) {
  const assessment = await findOne(dto.assessmentId, orgId);

  const priorAttempts = await countLearnerAttempts(orgId, learnerId, dto.courseId, dto.assessmentId);
  const retryLimitRaw = assessment.retryLimit;
  const retryLimit = typeof retryLimitRaw === 'number' && retryLimitRaw > 0 ? retryLimitRaw : Number.POSITIVE_INFINITY;
  if (priorAttempts >= retryLimit) throw BadRequest(`You have used all ${retryLimit} attempts for this quiz.`);

  // Score against the SAME question set the learner was shown.
  //
  // For a proctored/randomized attempt the GET route serves questions rebuilt
  // from the session manifest — a subset of the main bank, possibly in a
  // different order and with additional-pool questions swapped in
  // (`app/api/assessments/[id]/route.ts:33-52`). The learner's answers are keyed
  // by DISPLAYED position. Grading against `assessment.questions` (the raw bank
  // in creator order) therefore mis-graded every proctored/randomized attempt:
  // a learner who answered correctly could be failed, and vice versa. This
  // rebuilds `questionsToScore` from the manifest exactly as the original did
  // (`assessments.service.ts:259-277`).
  let questionsToScore = (assessment.questions as AnyRec[]) || [];
  if (dto.sessionId) {
    const manifest = await getSessionManifest(dto.sessionId);
    if (manifest && manifest.length > 0) {
      const main = (assessment.questions as AnyRec[]) || [];
      const additional = ((assessment as AnyRec).additionalQuestions as AnyRec[]) || [];
      questionsToScore = manifest
        .map((entry) => {
          const pool = entry.pool === 'additional' ? additional : main;
          return entry.index >= 0 && entry.index < pool.length ? pool[entry.index] : null;
        })
        .filter((q): q is AnyRec => q !== null);
    }
  }

  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;
  let wrongCount = 0;

  questionsToScore.forEach((question, index) => {
    // Default 1, NOT 0 — must mirror `create()`'s `points: q.points || 1`.
    // With `|| 0`, any question lacking an explicit `points` field (seeded,
    // imported, or written by a path other than create()) contributed 0 to
    // `totalPoints`; the whole assessment then totalled 0 and the percentage
    // calculation below short-circuited to 0. A fully correct attempt was
    // graded 0% and failed, which silently blocked course completion and every
    // certificate gated on it.
    const points = Number(question.points) || 1;
    totalPoints += points;
    const matched = dto.answers.filter(
      (a) => a.questionId === index.toString() || a.questionId === String(index) || parseInt(a.questionId, 10) === index,
    );

    let isCorrect = false;
    if (matched.length > 0) {
      const qType = String(question.type || '').toLowerCase();
      const answer = matched[0];
      if (qType === 'fillblank' || qType === 'fill_blank') {
        const expected = ((question.blanks as string[]) || []).map((b) => b.trim().toLowerCase());
        const given = answer?.textAnswer?.trim().toLowerCase() || '';
        isCorrect = expected.length > 0 && expected.includes(given);
      } else if (qType === 'match' || qType === 'drag_drop') {
        const pairs = (question.dragDropPairs as Array<{ left: string; right: string }>) || [];
        const submitted = answer?.matchAnswers || [];
        if (pairs.length > 0 && submitted.length === pairs.length) {
          isCorrect = pairs.every((p) => submitted.some((s) => s.left === p.left && s.right === p.right));
        }
      } else if (Array.isArray(question.correctAnswerIndex)) {
        const selectedIndices = matched
          .map((a) => a.selectedAnswerIndex ?? -1)
          .filter((idx) => idx >= 0)
          .sort((a, b) => a - b);
        const correctIndices = [...(question.correctAnswerIndex as number[])].sort((a, b) => a - b);
        isCorrect =
          selectedIndices.length === correctIndices.length &&
          selectedIndices.every((val, idx) => val === correctIndices[idx]);
      } else {
        isCorrect = answer.selectedAnswerIndex === question.correctAnswerIndex;
      }
    }

    if (isCorrect) {
      earnedPoints += points;
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const totalQuestions = questionsToScore.length;
  const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const passingScore = Number(assessment.passingScore) || 0;
  const passed = percentage >= passingScore;

  // Update or create progress.
  const existingProgress = await db.lmsProgress.findFirst({ where: { orgId, learnerId, courseId: dto.courseId } });
  const lessonProgress: AnyRec = (existingProgress?.lessonProgress as AnyRec | null) || {};
  lessonProgress[dto.assessmentId] = {
    lessonId: dto.assessmentId,
    completionPercentage: percentage,
    isCompleted: passed,
    attempted: true,
    lastAccessedAt: new Date(),
    quizScore: { raw: earnedPoints, max: totalPoints, min: 0, scaled: percentage / 100 },
  };

  const nextStatus =
    existingProgress?.status === 'NotStarted' || !existingProgress ? 'InProgress' : existingProgress.status;

  const progress = existingProgress
    ? await db.lmsProgress.update({
        where: { id: existingProgress.id },
        data: { quizScore: percentage, isPassed: passed, lessonProgress: lessonProgress as Prisma.InputJsonValue, status: nextStatus },
      })
    : await db.lmsProgress.create({
        data: {
          orgId,
          learnerId,
          courseId: dto.courseId,
          status: 'InProgress',
          quizScore: percentage,
          isPassed: passed,
          lessonProgress: lessonProgress as Prisma.InputJsonValue,
        },
      });

  // Persist QuizAttempt for standalone Assessment rows only — master-course
  // quizzes live inside MasterCourse.modules JSON and have no row to point at.
  //
  // The discriminator is `isMaster`, set by `transformMasterQuiz`, NOT the id
  // format. The previous `!UUID_RE.test(id)` test was inverted against the real
  // id space (`LmsAssessment.id` is `@default(uuid())`), so the branch never ran
  // for a standalone assessment and no attempt was ever written.
  if (!assessment.isMaster) {
    const answers = questionsToScore.map((question, index) => {
      const matched = dto.answers.filter(
        (a) => a.questionId === index.toString() || a.questionId === String(index) || parseInt(a.questionId, 10) === index,
      );
      let isCorrect = false;
      let selectedAnswerIndex: number | number[] = -1;
      if (matched.length > 0) {
        if (Array.isArray(question.correctAnswerIndex)) {
          const selectedIndices = matched.map((a) => a.selectedAnswerIndex ?? -1).filter((idx) => idx >= 0).sort((a, b) => a - b);
          const correctIndices = [...(question.correctAnswerIndex as number[])].sort((a, b) => a - b);
          selectedAnswerIndex = selectedIndices.length > 0 ? selectedIndices : [-1];
          isCorrect = selectedIndices.length === correctIndices.length && selectedIndices.every((val, idx) => val === correctIndices[idx]);
        } else {
          const answer = matched[0];
          selectedAnswerIndex = answer?.selectedAnswerIndex ?? -1;
          isCorrect = answer.selectedAnswerIndex === question.correctAnswerIndex;
        }
      }
      return {
        questionIndex: index,
        questionText: question.text,
        options: question.options,
        selectedAnswerIndex,
        correctAnswerIndex: question.correctAnswerIndex,
        isCorrect,
        explanation: question.explanation,
      };
    });

    await db.lmsQuizAttempt.create({
      data: {
        orgId,
        learnerId,
        courseId: dto.courseId,
        assessmentId: dto.assessmentId,
        answers: answers as unknown as Prisma.InputJsonValue,
        score: earnedPoints,
        totalPoints,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        submittedAt: new Date(),
      },
    });
  }

  return {
    score: earnedPoints,
    percentage: Math.round(percentage * 100) / 100,
    passed,
    correctCount,
    wrongCount,
    totalQuestions,
    progress,
    // Returned from HERE because this is where the cap is actually enforced
    // (`priorAttempts >= retryLimit`, above). The submit route used to derive
    // its own `Math.max(0, 1 - attempts.length)`, which contradicted the
    // service: an author could set maxAttempts to 3, the service would happily
    // allow all 3, and the learner would still be told 0 remained after the
    // first — so the Retake button never appeared and the setting looked dead.
    // `retryLimit <= 0` means unlimited (legacy semantics), reported as null.
    attemptsRemaining: Number.isFinite(retryLimit)
      ? Math.max(0, retryLimit - (priorAttempts + 1))
      : null,
    passingScore: Number(assessment.passingScore) || 0,
    totalPoints,
  };
}

// ── port of mapQuizQuestion ──────────────────────────────────────────────────
function mapQuizQuestion(q: AnyRec): AnyRec {
  const rawType = String(q.type || 'mcq').toLowerCase();
  let options: string[] = ((q.options as unknown[]) || [])
    .map((opt) => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt === 'object') {
        const o = opt as AnyRec;
        return String(o.text || o.label || o.value || '');
      }
      return String(opt || '');
    })
    .filter((s) => s.trim().length > 0);
  if (rawType === 'true_false' && options.length < 2) options = ['True', 'False'];

  let type = 'MCQ';
  if (rawType === 'true_false') type = 'TrueFalse';
  else if (rawType === 'multi_select') type = 'MultiSelect';
  else if (rawType === 'fill_blank') type = 'FillBlank';
  else if (rawType === 'drag_drop') type = 'Match';

  let correctAnswerIndex: number | number[] = 0;
  if (q.correctAnswer !== undefined) {
    if (typeof q.correctAnswer === 'boolean') correctAnswerIndex = q.correctAnswer ? 0 : 1;
    else if (typeof q.correctAnswer === 'number') correctAnswerIndex = q.correctAnswer;
    else if (Array.isArray(q.correctAnswer)) {
      const arr = q.correctAnswer as unknown[];
      if (arr.length > 0 && typeof arr[0] === 'string') {
        correctAnswerIndex = (arr as string[])
          .map((id) => ((q.options as AnyRec[]) || []).findIndex((opt) => typeof opt === 'object' && opt.id === id))
          .filter((idx) => idx >= 0);
      } else {
        correctAnswerIndex = arr as number[];
      }
    }
  } else if (q.correctAnswerIndex !== undefined) {
    correctAnswerIndex = q.correctAnswerIndex as number | number[];
  }

  const mapped: AnyRec = {
    text: q.text || q.question || '',
    type,
    options,
    correctAnswerIndex,
    explanation: q.explanation || '',
    points: q.points || 1,
  };
  if (rawType === 'fill_blank') {
    const blanks = q.blanks as string[] | undefined;
    mapped.blanks = blanks && blanks.length > 0 ? blanks : [''];
  }
  if (rawType === 'drag_drop') {
    const pairs = (q.dragDropPairs || q.matchPairs || q.pairs || []) as AnyRec[];
    mapped.dragDropPairs = pairs.map((p) => ({
      id: p.id || `pair_${Math.random().toString(36).slice(2, 10)}`,
      left: p.left || p.leftItem || p.key || '',
      right: p.right || p.rightItem || p.value || '',
    }));
  }
  if (q.imageUrl) mapped.imageUrl = q.imageUrl;
  if (q.audioUrl) mapped.audioUrl = q.audioUrl;
  return mapped;
}
