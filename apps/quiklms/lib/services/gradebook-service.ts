/**
 * Gradebook service — ported from GradebookService (Prisma).
 * Mongo aggregations rewritten as Prisma queries + JS reduction.
 * Weighted overall = 70% homework average + 30% attendance.
 */
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';

function computeLetterGrade(pct: number): { finalGrade: string; gradePoints: number } {
  if (pct >= 90) return { finalGrade: 'A', gradePoints: 4.0 };
  if (pct >= 80) return { finalGrade: 'B', gradePoints: 3.0 };
  if (pct >= 70) return { finalGrade: 'C', gradePoints: 2.0 };
  if (pct >= 60) return { finalGrade: 'D', gradePoints: 1.0 };
  return { finalGrade: 'F', gradePoints: 0.0 };
}

export async function computeStudentGrades(tenantId: string, studentId: string, batchId: string, term?: string) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) throw NotFound('Batch not found');

  // Homework average: submissions for this student joined to homeworks of this batch.
  const submissions = await prisma.homeworkSubmission.findMany({
    where: { tenantId, studentId, homework: { batchId } },
    select: { finalScore: true, score: true },
  });
  const hwScores = submissions.map((s) => s.finalScore ?? s.score ?? 0);
  const homeworkAverage = hwScores.length
    ? Math.round((hwScores.reduce((a, b) => a + b, 0) / hwScores.length) * 100) / 100
    : 0;

  // Attendance percentage
  const attendance = await prisma.attendance.findMany({ where: { tenantId, studentId, batchId }, select: { status: true } });
  const total = attendance.length;
  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendancePercent = total > 0 ? Math.round((present / total) * 10000) / 100 : 0;

  const overallPercentage = Math.round((homeworkAverage * 0.7 + attendancePercent * 0.3) * 100) / 100;
  const { finalGrade, gradePoints } = computeLetterGrade(overallPercentage);
  const resolvedTerm = term ?? batch.term ?? null;

  // term is nullable, so the composite unique can't be used in upsert.where — find then create/update.
  const existing = await prisma.gradeRecord.findFirst({ where: { tenantId, studentId, batchId, term: resolvedTerm } });
  const data = {
    subject: batch.subject, academicYear: batch.academicYear, homeworkAverage, assessmentAverage: 0,
    attendancePercent, finalGrade, gradePoints, overallPercentage, gradedAt: new Date(),
  };
  if (existing) return prisma.gradeRecord.update({ where: { id: existing.id }, data });
  return prisma.gradeRecord.create({ data: { tenantId, studentId, batchId, term: resolvedTerm, ...data } });
}

async function enrichRecords<T extends { studentId: string; batchId: string }>(records: T[]) {
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const batchIds = [...new Set(records.map((r) => r.batchId))];
  const students = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
  const batches = await prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true, subject: true, academicYear: true, term: true } });
  const sMap = new Map(students.map((s) => [s.id, s]));
  const bMap = new Map(batches.map((b) => [b.id, b]));
  return records.map((r) => ({ ...r, studentId: sMap.get(r.studentId) || r.studentId, batchId: bMap.get(r.batchId) || r.batchId }));
}

export async function getStudentGrades(tenantId: string, studentId: string) {
  const records = await prisma.gradeRecord.findMany({
    where: { tenantId, studentId }, orderBy: [{ academicYear: 'desc' }, { subject: 'asc' }],
  });
  return enrichRecords(records);
}

export async function getTranscript(tenantId: string, studentId: string, academicYear?: string) {
  const records = await prisma.gradeRecord.findMany({
    where: { tenantId, studentId, ...(academicYear ? { academicYear } : {}) },
    orderBy: [{ academicYear: 'desc' }, { term: 'asc' }, { subject: 'asc' }],
  });
  return enrichRecords(records);
}

export async function getClassRanking(tenantId: string, batchId: string, term?: string) {
  const records = await prisma.gradeRecord.findMany({
    where: { tenantId, batchId, ...(term ? { term } : {}) }, orderBy: { overallPercentage: 'desc' },
  });
  return enrichRecords(records);
}

export async function computeBatchGrades(tenantId: string, batchId: string, term?: string) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) throw NotFound('Batch not found');
  const students = await prisma.batchStudent.findMany({ where: { batchId }, select: { studentId: true } });
  const grades = await Promise.all(students.map((s) => computeStudentGrades(tenantId, s.studentId, batchId, term)));
  return { batchId, studentsProcessed: grades.length, grades };
}
