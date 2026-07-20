/**
 * Homework service — ported from NestJS HomeworkService (Mongoose → Prisma).
 * Tenant scoping via explicit orgId arguments. Submission rubric scores map to
 * the HomeworkRubricScore child table.
 *
 * S3 read-presigning is LIVE. Attachments (`attachmentUrls`) and graded feedback
 * files (`correctedFileUrl`) are stored as unsigned S3 URLs, which 403 against
 * the private bucket. The legacy presigned them on every read path
 * (`homework.service.ts:41-74`); the first port returned them raw, so every
 * homework attachment, student submission, and teacher-corrected file failed to
 * open. `enrichHomework` / `enrichSubmission` presign on the way out, matching
 * the peer `courses-service` fix.
 */
import type { Prisma, LmsHomeworkStatus as HomeworkStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';
import { presignFromUrlOrKey } from '@/lib/s3';

type ResourceLink = { url: string; label?: string };
type RubricScore = { criterion: string; maxScore: number; score: number; comment?: string };

export interface CreateHomeworkInput {
  title: string;
  description?: string;
  instructions?: string;
  batchId: string;
  attachmentUrls?: string[];
  resourceLinks?: ResourceLink[];
  dueDate: string;
  assignedToStudentIds?: string[];
  maxScore?: number;
  allowLateSubmission?: boolean;
  lateSubmissionDeadline?: string;
  latePenaltyPercent?: number;
  type?: 'assignment' | 'quiz' | 'project' | 'reading';
}

export interface UpdateHomeworkInput {
  title?: string;
  description?: string;
  instructions?: string;
  attachmentUrls?: string[];
  resourceLinks?: ResourceLink[];
  dueDate?: string;
  maxScore?: number;
  allowLateSubmission?: boolean;
  type?: 'assignment' | 'quiz' | 'project' | 'reading';
}

export interface SubmitHomeworkInput {
  attachmentUrls?: string[];
  textResponse?: string;
}

export interface GradeSubmissionInput {
  score: number;
  feedback?: string;
  correctedFileUrl?: string;
  rubricScores?: RubricScore[];
  richFeedback?: string;
}

const BATCH_LITE = { id: true, name: true, grade: true, subject: true } as const;

function stripPresignedParams(url: string): string {
  if (!url || !url.includes('X-Amz-')) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}
function normalizeUrls(urls: string[]): string[] {
  if (!urls?.length) return urls;
  return urls.map((u) => stripPresignedParams(u));
}

/** Presign a list of stored S3 urls; never throws (presignFromUrlOrKey passes through on failure). */
async function presignUrls(urls: unknown): Promise<string[]> {
  if (!Array.isArray(urls) || urls.length === 0) return (urls as string[]) ?? [];
  return Promise.all(urls.map(async (u) => (typeof u === 'string' ? (await presignFromUrlOrKey(u)) ?? u : u)));
}

/** Presign a homework record's `attachmentUrls` in place — port of `enrichHomework`. */
async function enrichHomework<T extends Record<string, unknown>>(hw: T): Promise<T> {
  if ('attachmentUrls' in hw) (hw as Record<string, unknown>).attachmentUrls = await presignUrls(hw.attachmentUrls);
  return hw;
}

/** Presign a submission's `attachmentUrls` + `correctedFileUrl` — port of `enrichSubmission`. */
async function enrichSubmission<T extends Record<string, unknown>>(sub: T): Promise<T> {
  if ('attachmentUrls' in sub) (sub as Record<string, unknown>).attachmentUrls = await presignUrls(sub.attachmentUrls);
  if (typeof sub.correctedFileUrl === 'string' && sub.correctedFileUrl) {
    (sub as Record<string, unknown>).correctedFileUrl = (await presignFromUrlOrKey(sub.correctedFileUrl)) ?? sub.correctedFileUrl;
  }
  return sub;
}

async function batchLite(batchId: string, withStudents = false) {
  if (withStudents) {
    const batch = await prisma.lmsBatch.findUnique({
      where: { id: batchId },
      select: { ...BATCH_LITE, students: { select: { studentId: true } } },
    });
    if (!batch) return null;
    const { students, ...rest } = batch;
    return { ...rest, studentIds: students.map((s) => s.studentId) };
  }
  return prisma.lmsBatch.findUnique({ where: { id: batchId }, select: BATCH_LITE });
}

// ═══════════════ CREATE HOMEWORK ═══════════════
export async function create(orgId: string, teacherId: string, dto: CreateHomeworkInput) {
  const homework = await prisma.lmsHomework.create({
    data: {
      orgId,
      teacherId,
      batchId: dto.batchId,
      title: dto.title,
      description: dto.description,
      instructions: dto.instructions,
      attachmentUrls: normalizeUrls(dto.attachmentUrls || []),
      resourceLinks: (dto.resourceLinks || []) as unknown as Prisma.InputJsonValue,
      dueDate: new Date(dto.dueDate),
      assignedToStudentIds: dto.assignedToStudentIds ?? [],
      maxScore: dto.maxScore,
      allowLateSubmission: dto.allowLateSubmission || false,
      lateSubmissionDeadline: dto.lateSubmissionDeadline ? new Date(dto.lateSubmissionDeadline) : undefined,
      latePenaltyPercent: dto.latePenaltyPercent,
      type: dto.type,
      status: 'published',
      publishedAt: new Date(),
    },
  });
  return homework;
}

// ═══════════════ GET TEACHER'S HOMEWORK ═══════════════
export async function getTeacherHomework(
  orgId: string,
  teacherId: string,
  filters?: { status?: string; batchId?: string },
) {
  const where: Prisma.LmsHomeworkWhereInput = { orgId, teacherId };
  if (filters?.status) where.status = filters.status as HomeworkStatus;
  if (filters?.batchId) where.batchId = filters.batchId;

  const results = await prisma.lmsHomework.findMany({ where, orderBy: { createdAt: 'desc' } });
  return Promise.all(
    results.map(async (hw) => enrichHomework({ ...hw, batchId: (await batchLite(hw.batchId)) ?? hw.batchId })),
  );
}

// ═══════════════ GET HOMEWORK BY ID ═══════════════
export async function findOne(orgId: string, homeworkId: string) {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');
  const [batch, teacher] = await Promise.all([
    batchLite(homework.batchId, true),
    prisma.lmsUser.findUnique({ where: { id: homework.teacherId }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return enrichHomework({ ...homework, batchId: batch ?? homework.batchId, teacherId: teacher ?? homework.teacherId });
}

// ═══════════════ UPDATE HOMEWORK ═══════════════
export async function update(orgId: string, homeworkId: string, dto: UpdateHomeworkInput) {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');

  const data: Prisma.LmsHomeworkUpdateInput = {};
  if (dto.title !== undefined) data.title = dto.title;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.instructions !== undefined) data.instructions = dto.instructions;
  if (dto.resourceLinks !== undefined) data.resourceLinks = dto.resourceLinks as unknown as Prisma.InputJsonValue;
  if (dto.maxScore !== undefined) data.maxScore = dto.maxScore;
  if (dto.allowLateSubmission !== undefined) data.allowLateSubmission = dto.allowLateSubmission;
  if (dto.type !== undefined) data.type = dto.type;
  if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
  if (dto.attachmentUrls) data.attachmentUrls = normalizeUrls(dto.attachmentUrls);

  const updated = await prisma.lmsHomework.update({ where: { id: homeworkId }, data });
  return enrichHomework({ ...updated, batchId: (await batchLite(updated.batchId)) ?? updated.batchId });
}

// ═══════════════ DELETE HOMEWORK ═══════════════
export async function remove(orgId: string, homeworkId: string): Promise<void> {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');

  /**
   * REFUSE to delete homework that students have already submitted to.
   *
   * Mongo had no referential actions, so `findOneAndDelete`
   * (`homework.service.ts:168-174`) removed only the homework document —
   * submissions, scores, feedback and corrected files all survived. Under
   * Postgres `LmsHomeworkSubmission.homework` is `onDelete: Cascade`
   * (`schema.prisma:17399`), with rubric scores cascading off that, so the same
   * call irreversibly wipes every student's submission, grade, feedback and
   * rubric for that assignment — and this endpoint is open to any TEACHER.
   *
   * Same guard the batch delete already carries.
   */
  const submissions = await prisma.lmsHomeworkSubmission.count({ where: { homeworkId } });
  if (submissions > 0) {
    throw BadRequest(
      `This homework cannot be deleted because it has ${submissions} student submission(s). ` +
        'Deleting it would erase their work, grades and feedback. Close the homework instead.',
    );
  }

  await prisma.lmsHomework.delete({ where: { id: homeworkId } });
}

// ═══════════════ PUBLISH HOMEWORK ═══════════════
export async function publish(orgId: string, homeworkId: string) {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');
  return prisma.lmsHomework.update({
    where: { id: homeworkId },
    data: { status: 'published', publishedAt: new Date() },
  });
}

// ═══════════════ CLOSE HOMEWORK ═══════════════
export async function close(orgId: string, homeworkId: string) {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');
  return prisma.lmsHomework.update({ where: { id: homeworkId }, data: { status: 'closed' } });
}

// ═══════════════ SUBMIT HOMEWORK (STUDENT) ═══════════════
export async function submitHomework(orgId: string, homeworkId: string, studentId: string, dto: SubmitHomeworkInput) {
  const homework = await prisma.lmsHomework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.orgId !== orgId) throw NotFound('Homework not found');
  if (homework.status === 'closed') throw BadRequest('This homework is closed for submissions');

  const existing = await prisma.lmsHomeworkSubmission.findFirst({ where: { homeworkId, studentId } });
  if (existing) throw BadRequest('You have already submitted this homework');

  const now = new Date();
  const isLate = now > new Date(homework.dueDate);
  if (isLate && !homework.allowLateSubmission) {
    throw BadRequest('Late submissions are not allowed for this homework');
  }

  const created = await prisma.lmsHomeworkSubmission.create({
    data: {
      orgId,
      homeworkId,
      studentId,
      attachmentUrls: normalizeUrls(dto.attachmentUrls || []),
      textResponse: dto.textResponse,
      submittedAt: now,
      isLate,
    },
    include: { rubricScores: true },
  });
  return enrichSubmission(created);
}

// ═══════════════ GET SUBMISSIONS FOR HOMEWORK ═══════════════
export async function getSubmissions(orgId: string, homeworkId: string) {
  const subs = await prisma.lmsHomeworkSubmission.findMany({
    where: { orgId, homeworkId },
    orderBy: { submittedAt: 'desc' },
    include: { rubricScores: true },
  });
  const studentIds = Array.from(new Set(subs.map((s) => s.studentId)));
  const students = studentIds.length
    ? await prisma.lmsUser.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true, email: true, grade: true, studentId: true },
      })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s]));
  return Promise.all(subs.map((s) => enrichSubmission({ ...s, studentId: studentMap.get(s.studentId) ?? s.studentId })));
}

// ═══════════════ GRADE SUBMISSION ═══════════════
export async function gradeSubmission(orgId: string, submissionId: string, gradedBy: string, dto: GradeSubmissionInput) {
  const submission = await prisma.lmsHomeworkSubmission.findFirst({ where: { id: submissionId, orgId } });
  if (!submission) throw NotFound('Submission not found');

  let finalScore = dto.score;
  let latePenaltyApplied = 0;
  if (submission.isLate) {
    const homework = await prisma.lmsHomework.findUnique({ where: { id: submission.homeworkId }, select: { latePenaltyPercent: true } });
    const penaltyPercent = homework?.latePenaltyPercent || 0;
    if (penaltyPercent > 0) {
      latePenaltyApplied = Math.round(dto.score * (penaltyPercent / 100));
      finalScore = dto.score - latePenaltyApplied;
    }
  }

  const updated = await prisma.lmsHomeworkSubmission.update({
    where: { id: submissionId },
    data: {
      score: dto.score,
      feedback: dto.feedback,
      correctedFileUrl: dto.correctedFileUrl ? stripPresignedParams(dto.correctedFileUrl) : undefined,
      richFeedback: dto.richFeedback,
      latePenaltyApplied,
      finalScore,
      gradedBy,
      gradedAt: new Date(),
      status: 'graded',
      rubricScores: {
        deleteMany: {},
        create: (dto.rubricScores || []).map((r) => ({
          criterion: r.criterion,
          maxScore: r.maxScore,
          score: r.score,
          comment: r.comment,
        })),
      },
    },
    include: { rubricScores: true },
  });

  const student = await prisma.lmsUser.findUnique({
    where: { id: updated.studentId },
    select: { id: true, firstName: true, lastName: true },
  });
  return enrichSubmission({ ...updated, studentId: student ?? updated.studentId });
}

// ═══════════════ GET HOMEWORK STATS ═══════════════
export async function getHomeworkStats(orgId: string, homeworkId: string) {
  const homework = await findOne(orgId, homeworkId);
  const batchStudentCount = (homework.batchId as { studentIds?: string[] })?.studentIds?.length || 0;

  const submissions = await prisma.lmsHomeworkSubmission.findMany({ where: { homeworkId } });
  const graded = submissions.filter((s) => s.status === 'graded');
  const scores = graded.map((s) => s.score).filter((s): s is number => s !== undefined && s !== null);

  return {
    totalStudents: batchStudentCount,
    submitted: submissions.length,
    pending: batchStudentCount - submissions.length,
    graded: graded.length,
    lateSubmissions: submissions.filter((s) => s.isLate).length,
    averageScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    highestScore: scores.length > 0 ? Math.max(...scores) : null,
    lowestScore: scores.length > 0 ? Math.min(...scores) : null,
  };
}

// ═══════════════ GET STUDENT'S SUBMISSIONS (PARENT/STUDENT VIEW) ═══════════════
export async function getStudentSubmissions(orgId: string, studentId: string, filters?: { status?: string }) {
  const where: Prisma.LmsHomeworkSubmissionWhereInput = { orgId, studentId };
  if (filters?.status) where.status = filters.status as Prisma.LmsHomeworkSubmissionWhereInput['status'];

  const submissions = await prisma.lmsHomeworkSubmission.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: { rubricScores: true },
  });

  // populate homeworkId (selected fields) + nested batchId, and gradedBy
  const homeworkIds = Array.from(new Set(submissions.map((s) => s.homeworkId)));
  const homeworks = homeworkIds.length
    ? await prisma.lmsHomework.findMany({
        where: { id: { in: homeworkIds } },
        select: {
          id: true, title: true, description: true, instructions: true, dueDate: true,
          maxScore: true, batchId: true, type: true, status: true, attachmentUrls: true, resourceLinks: true,
        },
      })
    : [];
  const hwBatchMap = new Map<string, unknown>();
  for (const bId of Array.from(new Set(homeworks.map((h) => h.batchId)))) {
    hwBatchMap.set(bId, await batchLite(bId));
  }
  const homeworkMap = new Map(
    homeworks.map((h) => [h.id, { ...h, batchId: hwBatchMap.get(h.batchId) ?? h.batchId }]),
  );

  const graderIds = Array.from(new Set(submissions.map((s) => s.gradedBy).filter(Boolean) as string[]));
  const graders = graderIds.length
    ? await prisma.lmsUser.findMany({ where: { id: { in: graderIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const graderMap = new Map(graders.map((g) => [g.id, g]));

  const studentBatches = await prisma.lmsBatchStudent.findMany({ where: { studentId, batch: { orgId } }, select: { batchId: true } });
  const studentBatchIds = studentBatches.map((b) => b.batchId);

  const submittedHomeworkIds = submissions.map((s) => s.homeworkId);

  const pendingHomeworkRaw = studentBatchIds.length
    ? await prisma.lmsHomework.findMany({
        where: {
          orgId,
          status: 'published',
          batchId: { in: studentBatchIds },
          id: { notIn: submittedHomeworkIds.length ? submittedHomeworkIds : ['__none__'] },
          OR: [{ assignedToStudentIds: { isEmpty: true } }, { assignedToStudentIds: { has: studentId } }],
        },
      })
    : [];

  const enrichedSubmissions = await Promise.all(
    submissions.map(async (s) => {
      // The nested homework carries its own attachmentUrls (the assignment
      // files); presign those too, not just the submission's.
      const hw = homeworkMap.get(s.homeworkId);
      const homeworkId = hw ? await enrichHomework({ ...(hw as Record<string, unknown>) }) : s.homeworkId;
      return enrichSubmission({
        ...s,
        homeworkId,
        gradedBy: s.gradedBy ? graderMap.get(s.gradedBy) ?? s.gradedBy : s.gradedBy,
      });
    }),
  );

  const teacherIds = Array.from(new Set(pendingHomeworkRaw.map((h) => h.teacherId)));
  const teachers = teacherIds.length
    ? await prisma.lmsUser.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const pendingBatchMap = new Map<string, unknown>();
  for (const bId of Array.from(new Set(pendingHomeworkRaw.map((h) => h.batchId)))) {
    pendingBatchMap.set(bId, await batchLite(bId));
  }
  const enrichedPending = await Promise.all(
    pendingHomeworkRaw.map((hw) =>
      enrichHomework({
        ...hw,
        batchId: pendingBatchMap.get(hw.batchId) ?? hw.batchId,
        teacherId: teacherMap.get(hw.teacherId) ?? hw.teacherId,
      }),
    ),
  );

  return { submissions: enrichedSubmissions, pending: enrichedPending };
}
