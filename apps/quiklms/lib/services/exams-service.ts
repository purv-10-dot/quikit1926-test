/**
 * Exams service — ported from ExamsService (Mongo → Prisma).
 * Exam.questions is the exam_questions join table (ExamQuestion → Question).
 * orgId is enforced by callers via tenantWhere(); assertTenantMatch after
 * single fetch. The Socket.IO realtime timer/forceSubmit lives in the worker.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';
import type { AuthUser } from '@/lib/auth/context';
import { tenantWhere, assertTenantMatch } from '@/lib/auth/context';

const ACTIVE_EXAM_STATUSES = ['published', 'active', 'completed', 'results_published'] as const;

type QuestionInput = { questionId: string; points?: number; order?: number };

interface AutoSelectRules {
  count?: number;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
}

async function autoSelectQuestions(orgId: string, rules: AutoSelectRules) {
  const where: Prisma.LmsQuestionWhereInput = { orgId, isActive: true };
  if (rules.subject) where.subject = rules.subject;
  if (rules.difficulty) where.difficulty = rules.difficulty;
  if (rules.tags?.length) where.tags = { hasSome: rules.tags };

  const pool = await prisma.lmsQuestion.findMany({ where, select: { id: true, points: true } });
  // $sample equivalent — shuffle and take N
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, rules.count || 10);
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function createExam(user: AuthUser, userId: string, data: Record<string, unknown>) {
  const orgId = user.orgId as string;

  if (data.batchId) {
    const batch = await prisma.lmsBatch.findFirst({ where: tenantWhere(user, { id: data.batchId as string }) });
    if (!batch) throw NotFound('Batch not found');
  }

  const subject = (data.subject as string) || (data.title as string) || 'General';

  let questions: QuestionInput[] = (data.questions as QuestionInput[]) || [];
  let totalMarks = (data.totalMarks as number) || 0;

  if (data.questionSelectionMode === 'auto_random' && data.autoSelectRules) {
    const selected = await autoSelectQuestions(orgId, data.autoSelectRules as AutoSelectRules);
    questions = selected.map((q, i) => ({ questionId: q.id, points: q.points || 1, order: i + 1 }));
    totalMarks = questions.reduce((sum, q) => sum + (q.points || 0), 0);
  }

  const computedMarks = totalMarks || questions.reduce((sum, q) => sum + (q.points || 1), 0);

  // Deduped for the same reason as updateExam — @@unique([examId, questionId])
  // rejects a repeat that Mongo's plain array accepted.
  const cleanQuestions = dedupeQuestions(questions).map((q) => ({
    questionId: q.questionId,
    points: q.points || 1,
    order: q.order,
  }));

  // Tenant-scope client-supplied question IDs: only this tenant's questions may be attached.
  if (cleanQuestions.length) {
    const ids = [...new Set(cleanQuestions.map((q) => q.questionId))];
    const owned = await prisma.lmsQuestion.findMany({ where: { id: { in: ids }, orgId }, select: { id: true } });
    const ownedSet = new Set(owned.map((q) => q.id));
    const foreign = ids.filter((id) => !ownedSet.has(id));
    if (foreign.length) throw BadRequest('One or more question IDs are invalid for this tenant');
  }

  const exam = await prisma.lmsExam.create({
    data: {
      title: data.title as string,
      description: (data.description as string) || '',
      instructions: (data.instructions as string) || '',
      subject,
      batchId: (data.batchId as string) || undefined,
      duration: data.duration as number,
      totalMarks: computedMarks || 1,
      questionSelectionMode: (data.questionSelectionMode as 'manual' | 'auto_random') || 'manual',
      autoSelectRules: (data.autoSelectRules as Prisma.InputJsonValue) ?? undefined,
      settings: (data.settings as Prisma.InputJsonValue) ?? {},
      proctoringLevel: (data.proctoringLevel as 'none' | 'soft') || 'soft',
      scheduledStartTime: data.scheduledStartTime ? new Date(data.scheduledStartTime as string) : undefined,
      scheduledEndTime: data.scheduledEndTime ? new Date(data.scheduledEndTime as string) : undefined,
      orgId,
      createdBy: userId,
      questions: {
        create: cleanQuestions.map((q) => ({
          questionId: q.questionId,
          points: q.points,
          order: q.order,
        })),
      },
    },
    include: { questions: true },
  });
  return exam;
}

/**
 * Reshape a Prisma exam into the shape `.populate()` produced.
 *
 * THE BUG THIS FIXES. Mongoose `.populate('batchId', ...)` REPLACES the field:
 * `exam.batchId` becomes `{_id, name, grade, subject}`. The port instead added
 * the relation under a NEW key (`batch`) and left `batchId` a raw uuid string.
 * Three consequences, all live in the UI:
 *
 *  - `exams/page.tsx:129` — `{exam.batchId && <span>Batch: {exam.batchId.name}</span>}`:
 *    a string is truthy and `.name` is undefined, so every batch-bound exam
 *    rendered "Batch: " with a blank name.
 *  - `exams/create/page.tsx:76` — `batchId: exam.batchId?._id || ''` yields `''`
 *    on a string. An admin opening a draft to fix a typo and saving would
 *    **destroy the batch assignment** (`updateExam` disconnects on falsy), and
 *    the now-null-batch exam becomes visible to EVERY learner in the org
 *    (`getStudentExams` shows null-batch exams org-wide). Silent data loss plus
 *    unintended exposure.
 *  - `exams/create/page.tsx:82-85` — same shape bug on `questions[].questionId`
 *    left `_question` a string, so the editor listed raw UUIDs instead of
 *    question text.
 *
 * Rather than patch each caller, the API contract is restored: the scalar FK is
 * REPLACED by the populated object, exactly as before.
 */
/**
 * Keep the FIRST occurrence of each questionId.
 *
 * Mongo stored `questions` as a plain array, so the same question twice was
 * accepted. Postgres has `@@unique([examId, questionId])`, so a duplicate throws
 * P2002 — and in `updateExam` that fired AFTER the join rows were deleted,
 * wiping the exam's questions. De-duplicating keeps the save working instead of
 * 500ing on a payload the legacy accepted.
 */
function dedupeQuestions(questions: QuestionInput[]): QuestionInput[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.questionId)) return false;
    seen.add(q.questionId);
    return true;
  });
}

type RawExam = Record<string, unknown> & { batchId?: string | null; batch?: unknown; questions?: unknown };

function shapeExam<T extends RawExam>(exam: T) {
  const { batch, questions, ...rest } = exam as RawExam;
  const shaped: Record<string, unknown> = { ...rest };

  // populate('batchId', 'name grade subject') → replace the id with the doc.
  shaped.batchId = batch ? { _id: rest.batchId, ...(batch as object) } : rest.batchId ?? null;

  if (Array.isArray(questions)) {
    shaped.questions = (questions as Array<Record<string, unknown>>).map((q) => {
      const { question, ...qRest } = q;
      return {
        ...qRest,
        // populate('questions.questionId') → replace the id with the doc.
        questionId: question ? { _id: q.questionId, ...(question as object) } : q.questionId,
      };
    });
  }
  return shaped;
}

/**
 * Strip the answer key from an exam's questions.
 *
 * `GET /exams/:id` is open to LEARNER, and both the original and the first port
 * returned every question in full — `correctAnswer`, each option's `isCorrect`
 * flag, and `explanation`. A learner could `curl` the exam before starting and
 * read every answer. This is a pre-existing hole (the legacy leaked it too), so
 * it is a DELIBERATE DEVIATION from parity, taken on the product owner's
 * instruction (2026-07-18): a cheating hole should not survive the migration
 * just because it predates it.
 *
 * Teachers/admins are unaffected — they need the key to author and grade.
 * `exam-sessions.getSessionWithQuestions` already redacts on the sit-the-exam
 * path (`:136`); this closes the direct-read path it left open.
 */
function stripAnswerKey(exam: Record<string, unknown>): Record<string, unknown> {
  const questions = exam.questions;
  if (!Array.isArray(questions)) return exam;

  return {
    ...exam,
    questions: questions.map((q) => {
      const row = q as Record<string, unknown>;
      const inner = row.questionId;
      if (!inner || typeof inner !== 'object') return row;

      const { correctAnswer: _ca, explanation: _ex, options, ...safe } = inner as Record<string, unknown>;
      return {
        ...row,
        questionId: {
          ...safe,
          // Keep the option TEXT (the learner must see the choices) but drop the
          // isCorrect flag that marks the right one.
          options: Array.isArray(options)
            ? options.map((o) => {
                const opt = o as Record<string, unknown>;
                return { text: opt.text };
              })
            : options,
        },
      };
    }),
  };
}

export async function findAllExams(
  user: AuthUser,
  filters: { batchId?: string; status?: string; subject?: string },
) {
  const where = tenantWhere(user, {} as Prisma.LmsExamWhereInput);
  if (filters.batchId) where.batchId = filters.batchId;
  if (filters.status) where.status = filters.status as Prisma.LmsExamWhereInput['status'];
  if (filters.subject) where.subject = filters.subject;

  const exams = await prisma.lmsExam.findMany({
    where,
    include: {
      batch: { select: { name: true, grade: true, subject: true } },
      // `questions` was an EMBEDDED array in Mongo, so the legacy list carried it
      // for free (with raw question refs — findAll did not populate them).
      // Without it `exams/page.tsx:132` renders "Questions: 0" for every exam,
      // including published ones with 40 questions.
      questions: { select: { questionId: true, points: true, order: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return exams.map(shapeExam);
}

export async function findOneExam(user: AuthUser, id: string) {
  const exam = await prisma.lmsExam.findFirst({
    where: tenantWhere(user, { id }),
    include: {
      batch: { select: { name: true, grade: true, subject: true } },
      questions: { include: { question: true } },
    },
  });
  if (!exam) throw NotFound('Exam not found');
  assertTenantMatch(user, exam.orgId);

  const shaped = shapeExam(exam);
  // Learners never receive the answer key — see stripAnswerKey.
  const isStaff =
    user.role === 'TEACHER' ||
    user.role === 'TENANT_ADMIN' ||
    user.role === 'SUB_ADMIN' ||
    user.role === 'SUPER_ADMIN' ||
    user.secondaryRole === 'TEACHER' ||
    user.secondaryRole === 'TENANT_ADMIN' ||
    user.secondaryRole === 'SUB_ADMIN';
  return isStaff ? shaped : stripAnswerKey(shaped);
}

async function findOneRaw(user: AuthUser, id: string) {
  const exam = await prisma.lmsExam.findFirst({
    where: tenantWhere(user, { id }),
    include: { questions: true },
  });
  if (!exam) throw NotFound('Exam not found');
  assertTenantMatch(user, exam.orgId);
  return exam;
}

export async function updateExam(user: AuthUser, id: string, data: Record<string, unknown>) {
  const exam = await prisma.lmsExam.findFirst({ where: tenantWhere(user, { id }), include: { questions: true } });
  if (!exam) throw NotFound('Exam not found');
  assertTenantMatch(user, exam.orgId);
  if (exam.status !== 'draft') throw BadRequest('Only draft exams can be edited');

  const update: Prisma.LmsExamUpdateInput = {};
  if (data.title !== undefined) update.title = data.title as string;
  if (data.description !== undefined) update.description = data.description as string;
  if (data.instructions !== undefined) update.instructions = data.instructions as string;
  if (data.duration !== undefined) update.duration = data.duration as number;
  if (data.questionSelectionMode !== undefined) update.questionSelectionMode = data.questionSelectionMode as 'manual' | 'auto_random';
  if (data.autoSelectRules !== undefined) update.autoSelectRules = (data.autoSelectRules as Prisma.InputJsonValue) ?? undefined;
  if (data.settings !== undefined) update.settings = (data.settings as Prisma.InputJsonValue) ?? {};
  if (data.proctoringLevel !== undefined) update.proctoringLevel = data.proctoringLevel as 'none' | 'soft';
  if (data.scheduledStartTime !== undefined) update.scheduledStartTime = data.scheduledStartTime ? new Date(data.scheduledStartTime as string) : null;
  if (data.scheduledEndTime !== undefined) update.scheduledEndTime = data.scheduledEndTime ? new Date(data.scheduledEndTime as string) : null;

  update.batch = data.batchId ? { connect: { id: data.batchId as string } } : { disconnect: true };
  update.subject = (data.subject as string) || (data.title as string) || exam.title || 'General';

  let replaceQuestions: QuestionInput[] | null = null;
  if (data.questions) {
    const questions = dedupeQuestions(data.questions as QuestionInput[]);
    update.totalMarks = questions.reduce((sum, q) => sum + (q.points || 1), 0);
    // Tenant-scope client-supplied question IDs: only this tenant's questions may be attached.
    const ids = [...new Set(questions.map((q) => q.questionId))];
    if (ids.length) {
      const owned = await prisma.lmsQuestion.findMany({ where: { id: { in: ids }, orgId: exam.orgId }, select: { id: true } });
      const ownedSet = new Set(owned.map((q) => q.id));
      const foreign = ids.filter((qid) => !ownedSet.has(qid));
      if (foreign.length) throw BadRequest('One or more question IDs are invalid for this tenant');
    }
    replaceQuestions = questions;
  }

  /**
   * ATOMIC. The legacy rebuilt `questions` in memory and wrote it in a SINGLE
   * `findByIdAndUpdate($set)` — atomic by construction. The port did
   * `deleteMany` and then a separate `update`, so any failure in between (a
   * stale `batchId` → P2025, a duplicate question → P2002) committed the delete
   * and left the exam with **zero questions** while returning a 500. The admin's
   * question set was gone and the exam unpublishable.
   */
  const updated = await prisma.$transaction(async (tx) => {
    if (replaceQuestions) {
      await tx.lmsExamQuestion.deleteMany({ where: { examId: id } });
      update.questions = {
        create: replaceQuestions.map((q) => ({ questionId: q.questionId, points: q.points || 1, order: q.order })),
      };
    }
    return tx.lmsExam.update({
      where: { id },
      data: update,
      include: {
        batch: { select: { name: true, grade: true, subject: true } },
        questions: { include: { question: true } },
      },
    });
  });

  return shapeExam(updated);
}

export async function publishExam(user: AuthUser, id: string) {
  const exam = await findOneRaw(user, id);
  if (exam.questions.length === 0) throw BadRequest('Cannot publish an exam with no questions');
  if (!exam.scheduledStartTime || !exam.scheduledEndTime) {
    throw BadRequest('Scheduled start and end times are required');
  }
  return prisma.lmsExam.update({ where: { id }, data: { status: 'published' } });
}

export async function publishResults(user: AuthUser, id: string) {
  const exam = await findOneRaw(user, id);
  if (exam.status !== 'completed' && exam.status !== 'active') {
    throw BadRequest('Exam must be completed before publishing results');
  }
  return prisma.lmsExam.update({
    where: { id },
    data: { status: 'results_published', resultPublishedAt: new Date() },
  });
}

export async function getStudentExams(user: AuthUser, studentId: string) {
  const orgId = user.orgId as string;

  const learner = await prisma.lmsUser.findFirst({
    where: tenantWhere(user, { id: studentId }),
    select: { grade: true },
  });

  const enrolledBatches = await prisma.lmsBatch.findMany({
    where: tenantWhere(user, { students: { some: { studentId } } }),
    select: { id: true, name: true },
  });

  let gradeBatches: { id: string; name: string }[] = [];
  if (learner?.grade) {
    gradeBatches = await prisma.lmsBatch.findMany({
      where: tenantWhere(user, { grade: learner.grade, status: 'active' } as Prisma.LmsBatchWhereInput),
      select: { id: true, name: true },
    });
  }

  const mergedBatchMap = new Map<string, { id: string; name: string }>();
  [...enrolledBatches, ...gradeBatches].forEach((b) => mergedBatchMap.set(b.id, b));
  const batchIds = Array.from(mergedBatchMap.keys());

  const where = tenantWhere(user, {
    status: { in: ACTIVE_EXAM_STATUSES as unknown as Prisma.LmsExamWhereInput['status'] },
  } as Prisma.LmsExamWhereInput);

  if (batchIds.length > 0) {
    where.OR = [{ batchId: { in: batchIds } }, { batchId: null }];
  } else {
    where.batchId = null;
  }

  const exams = await prisma.lmsExam.findMany({
    where,
    select: {
      id: true, title: true, subject: true, duration: true, totalMarks: true,
      scheduledStartTime: true, scheduledEndTime: true, status: true, proctoringLevel: true,
      batchId: true, settings: true,
      batch: { select: { name: true, grade: true, subject: true } },
    },
    orderBy: { scheduledStartTime: 'desc' },
  });

  const examIds = exams.map((e) => e.id);
  const sessions = await prisma.lmsExamSession.findMany({
    where: { studentId, examId: { in: examIds }, orgId },
    select: { examId: true, status: true, score: true, percentage: true, passed: true, startedAt: true, endedAt: true },
  });
  const sessionMap = new Map(sessions.map((s) => [s.examId, s]));

  return exams.map((e) => ({ ...e, mySession: sessionMap.get(e.id) || null }));
}
