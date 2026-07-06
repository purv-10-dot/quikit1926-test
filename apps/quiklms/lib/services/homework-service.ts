/**
 * Homework service — ported from NestJS HomeworkService (Mongoose → Prisma).
 * Tenant scoping via explicit tenantId arguments. Submission rubric scores map to
 * the HomeworkRubricScore child table. The legacy S3 presigning of attachment
 * URLs is an external-infra enrichment; URLs are returned as stored (passthrough)
 * to preserve the response shape without inventing presign behavior.
 */
import type { Prisma, HomeworkStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

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

async function batchLite(batchId: string, withStudents = false) {
  if (withStudents) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { ...BATCH_LITE, students: { select: { studentId: true } } },
    });
    if (!batch) return null;
    const { students, ...rest } = batch;
    return { ...rest, studentIds: students.map((s) => s.studentId) };
  }
  return prisma.batch.findUnique({ where: { id: batchId }, select: BATCH_LITE });
}

// ═══════════════ CREATE HOMEWORK ═══════════════
export async function create(tenantId: string, teacherId: string, dto: CreateHomeworkInput) {
  const homework = await prisma.homework.create({
    data: {
      tenantId,
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
  tenantId: string,
  teacherId: string,
  filters?: { status?: string; batchId?: string },
) {
  const where: Prisma.HomeworkWhereInput = { tenantId, teacherId };
  if (filters?.status) where.status = filters.status as HomeworkStatus;
  if (filters?.batchId) where.batchId = filters.batchId;

  const results = await prisma.homework.findMany({ where, orderBy: { createdAt: 'desc' } });
  return Promise.all(
    results.map(async (hw) => ({ ...hw, batchId: (await batchLite(hw.batchId)) ?? hw.batchId })),
  );
}

// ═══════════════ GET HOMEWORK BY ID ═══════════════
export async function findOne(tenantId: string, homeworkId: string) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');
  const [batch, teacher] = await Promise.all([
    batchLite(homework.batchId, true),
    prisma.user.findUnique({ where: { id: homework.teacherId }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return { ...homework, batchId: batch ?? homework.batchId, teacherId: teacher ?? homework.teacherId };
}

// ═══════════════ UPDATE HOMEWORK ═══════════════
export async function update(tenantId: string, homeworkId: string, dto: UpdateHomeworkInput) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');

  const data: Prisma.HomeworkUpdateInput = {};
  if (dto.title !== undefined) data.title = dto.title;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.instructions !== undefined) data.instructions = dto.instructions;
  if (dto.resourceLinks !== undefined) data.resourceLinks = dto.resourceLinks as unknown as Prisma.InputJsonValue;
  if (dto.maxScore !== undefined) data.maxScore = dto.maxScore;
  if (dto.allowLateSubmission !== undefined) data.allowLateSubmission = dto.allowLateSubmission;
  if (dto.type !== undefined) data.type = dto.type;
  if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
  if (dto.attachmentUrls) data.attachmentUrls = normalizeUrls(dto.attachmentUrls);

  const updated = await prisma.homework.update({ where: { id: homeworkId }, data });
  return { ...updated, batchId: (await batchLite(updated.batchId)) ?? updated.batchId };
}

// ═══════════════ DELETE HOMEWORK ═══════════════
export async function remove(tenantId: string, homeworkId: string): Promise<void> {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');
  await prisma.homework.delete({ where: { id: homeworkId } });
}

// ═══════════════ PUBLISH HOMEWORK ═══════════════
export async function publish(tenantId: string, homeworkId: string) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');
  return prisma.homework.update({
    where: { id: homeworkId },
    data: { status: 'published', publishedAt: new Date() },
  });
}

// ═══════════════ CLOSE HOMEWORK ═══════════════
export async function close(tenantId: string, homeworkId: string) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');
  return prisma.homework.update({ where: { id: homeworkId }, data: { status: 'closed' } });
}

// ═══════════════ SUBMIT HOMEWORK (STUDENT) ═══════════════
export async function submitHomework(tenantId: string, homeworkId: string, studentId: string, dto: SubmitHomeworkInput) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.tenantId !== tenantId) throw NotFound('Homework not found');
  if (homework.status === 'closed') throw BadRequest('This homework is closed for submissions');

  const existing = await prisma.homeworkSubmission.findFirst({ where: { homeworkId, studentId } });
  if (existing) throw BadRequest('You have already submitted this homework');

  const now = new Date();
  const isLate = now > new Date(homework.dueDate);
  if (isLate && !homework.allowLateSubmission) {
    throw BadRequest('Late submissions are not allowed for this homework');
  }

  const created = await prisma.homeworkSubmission.create({
    data: {
      tenantId,
      homeworkId,
      studentId,
      attachmentUrls: normalizeUrls(dto.attachmentUrls || []),
      textResponse: dto.textResponse,
      submittedAt: now,
      isLate,
    },
    include: { rubricScores: true },
  });
  return created;
}

// ═══════════════ GET SUBMISSIONS FOR HOMEWORK ═══════════════
export async function getSubmissions(tenantId: string, homeworkId: string) {
  const subs = await prisma.homeworkSubmission.findMany({
    where: { tenantId, homeworkId },
    orderBy: { submittedAt: 'desc' },
    include: { rubricScores: true },
  });
  const studentIds = Array.from(new Set(subs.map((s) => s.studentId)));
  const students = studentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true, email: true, grade: true, studentId: true },
      })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s]));
  return subs.map((s) => ({ ...s, studentId: studentMap.get(s.studentId) ?? s.studentId }));
}

// ═══════════════ GRADE SUBMISSION ═══════════════
export async function gradeSubmission(tenantId: string, submissionId: string, gradedBy: string, dto: GradeSubmissionInput) {
  const submission = await prisma.homeworkSubmission.findFirst({ where: { id: submissionId, tenantId } });
  if (!submission) throw NotFound('Submission not found');

  let finalScore = dto.score;
  let latePenaltyApplied = 0;
  if (submission.isLate) {
    const homework = await prisma.homework.findUnique({ where: { id: submission.homeworkId }, select: { latePenaltyPercent: true } });
    const penaltyPercent = homework?.latePenaltyPercent || 0;
    if (penaltyPercent > 0) {
      latePenaltyApplied = Math.round(dto.score * (penaltyPercent / 100));
      finalScore = dto.score - latePenaltyApplied;
    }
  }

  const updated = await prisma.homeworkSubmission.update({
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

  const student = await prisma.user.findUnique({
    where: { id: updated.studentId },
    select: { id: true, firstName: true, lastName: true },
  });
  return { ...updated, studentId: student ?? updated.studentId };
}

// ═══════════════ GET HOMEWORK STATS ═══════════════
export async function getHomeworkStats(tenantId: string, homeworkId: string) {
  const homework = await findOne(tenantId, homeworkId);
  const batchStudentCount = (homework.batchId as { studentIds?: string[] })?.studentIds?.length || 0;

  const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId } });
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
export async function getStudentSubmissions(tenantId: string, studentId: string, filters?: { status?: string }) {
  const where: Prisma.HomeworkSubmissionWhereInput = { tenantId, studentId };
  if (filters?.status) where.status = filters.status as Prisma.HomeworkSubmissionWhereInput['status'];

  const submissions = await prisma.homeworkSubmission.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: { rubricScores: true },
  });

  // populate homeworkId (selected fields) + nested batchId, and gradedBy
  const homeworkIds = Array.from(new Set(submissions.map((s) => s.homeworkId)));
  const homeworks = homeworkIds.length
    ? await prisma.homework.findMany({
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
    ? await prisma.user.findMany({ where: { id: { in: graderIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const graderMap = new Map(graders.map((g) => [g.id, g]));

  const studentBatches = await prisma.batchStudent.findMany({ where: { studentId, batch: { tenantId } }, select: { batchId: true } });
  const studentBatchIds = studentBatches.map((b) => b.batchId);

  const submittedHomeworkIds = submissions.map((s) => s.homeworkId);

  const pendingHomeworkRaw = studentBatchIds.length
    ? await prisma.homework.findMany({
        where: {
          tenantId,
          status: 'published',
          batchId: { in: studentBatchIds },
          id: { notIn: submittedHomeworkIds.length ? submittedHomeworkIds : ['__none__'] },
          OR: [{ assignedToStudentIds: { isEmpty: true } }, { assignedToStudentIds: { has: studentId } }],
        },
      })
    : [];

  const enrichedSubmissions = submissions.map((s) => ({
    ...s,
    homeworkId: homeworkMap.get(s.homeworkId) ?? s.homeworkId,
    gradedBy: s.gradedBy ? graderMap.get(s.gradedBy) ?? s.gradedBy : s.gradedBy,
  }));

  const teacherIds = Array.from(new Set(pendingHomeworkRaw.map((h) => h.teacherId)));
  const teachers = teacherIds.length
    ? await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const pendingBatchMap = new Map<string, unknown>();
  for (const bId of Array.from(new Set(pendingHomeworkRaw.map((h) => h.batchId)))) {
    pendingBatchMap.set(bId, await batchLite(bId));
  }
  const enrichedPending = pendingHomeworkRaw.map((hw) => ({
    ...hw,
    batchId: pendingBatchMap.get(hw.batchId) ?? hw.batchId,
    teacherId: teacherMap.get(hw.teacherId) ?? hw.teacherId,
  }));

  return { submissions: enrichedSubmissions, pending: enrichedPending };
}
