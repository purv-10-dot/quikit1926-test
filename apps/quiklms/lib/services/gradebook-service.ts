/**
 * Gradebook service — ported from GradebookService (Prisma).
 * Mongo aggregations rewritten as Prisma queries + JS reduction.
 * Weighted overall = 70% homework average + 30% attendance.
 */
import { db } from '@/lib/db';
import { NotFound } from '@/lib/http';

function computeLetterGrade(pct: number): { finalGrade: string; gradePoints: number } {
  if (pct >= 90) return { finalGrade: 'A', gradePoints: 4.0 };
  if (pct >= 80) return { finalGrade: 'B', gradePoints: 3.0 };
  if (pct >= 70) return { finalGrade: 'C', gradePoints: 2.0 };
  if (pct >= 60) return { finalGrade: 'D', gradePoints: 1.0 };
  return { finalGrade: 'F', gradePoints: 0.0 };
}

export async function computeStudentGrades(orgId: string, studentId: string, batchId: string, term?: string) {
  const batch = await db.lmsBatch.findFirst({ where: { id: batchId, orgId } });
  if (!batch) throw NotFound('Batch not found');

  // Homework average: submissions for this student joined to homeworks of this batch.
  const submissions = await db.lmsHomeworkSubmission.findMany({
    where: { orgId, studentId, homework: { batchId } },
    select: { finalScore: true, score: true },
  });
  /**
   * UNGRADED submissions are EXCLUDED from the average, not counted as zero.
   *
   * The legacy used `$avg: { $ifNull: ['$finalScore', '$score'] }`
   * (`gradebook.service.ts:63-73`). When both fields are null the expression
   * yields null, and Mongo's `$avg` drops nulls from BOTH the numerator and the
   * denominator. The port coerced them to `0`, which then counted in the
   * divisor: a student with `[80, ungraded]` scored 80 under Mongo and **40**
   * here — and since `overallPercentage` is 70% homework, that turns a B into
   * an F, then feeds the class rankings. Every student with an unmarked
   * submission was graded wrong.
   */
  const hwScores = submissions
    .map((s) => s.finalScore ?? s.score)
    .filter((v): v is number => typeof v === 'number');
  const homeworkAverage = hwScores.length
    ? Math.round((hwScores.reduce((a, b) => a + b, 0) / hwScores.length) * 100) / 100
    : 0;

  // Attendance percentage
  const attendance = await db.lmsAttendance.findMany({ where: { orgId, studentId, batchId }, select: { status: true } });
  const total = attendance.length;
  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendancePercent = total > 0 ? Math.round((present / total) * 10000) / 100 : 0;

  const overallPercentage = Math.round((homeworkAverage * 0.7 + attendancePercent * 0.3) * 100) / 100;
  const { finalGrade, gradePoints } = computeLetterGrade(overallPercentage);
  const resolvedTerm = term ?? batch.term ?? null;

  const data = {
    subject: batch.subject, academicYear: batch.academicYear, homeworkAverage, assessmentAverage: 0,
    attendancePercent, finalGrade, gradePoints, overallPercentage, gradedAt: new Date(),
  };

  /**
   * `term` is nullable so the composite unique cannot drive `upsert.where`, and
   * the find-then-write below is therefore racy: the legacy did this in ONE
   * `findOneAndUpdate({upsert:true})` (`gradebook.service.ts:111-132`). Two
   * concurrent batch computes both missed the row and the second `create`
   * violated `@@unique([orgId, studentId, batchId, term])`, 500ing partway
   * through and leaving half the class graded.
   *
   * The transaction closes the window, and the P2002 catch makes the loser of a
   * genuine race retry as an update instead of failing the whole batch.
   */
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.lmsGradeRecord.findFirst({
        where: { orgId, studentId, batchId, term: resolvedTerm },
      });
      if (existing) return tx.lmsGradeRecord.update({ where: { id: existing.id }, data });
      return tx.lmsGradeRecord.create({ data: { orgId, studentId, batchId, term: resolvedTerm, ...data } });
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      const existing = await db.lmsGradeRecord.findFirst({
        where: { orgId, studentId, batchId, term: resolvedTerm },
      });
      if (existing) return db.lmsGradeRecord.update({ where: { id: existing.id }, data });
    }
    throw err;
  }
}

async function enrichRecords<T extends { studentId: string; batchId: string }>(records: T[]) {
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const batchIds = [...new Set(records.map((r) => r.batchId))];
  const students = await db.lmsUser.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
  const batches = await db.lmsBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true, subject: true, academicYear: true, term: true } });
  const sMap = new Map(students.map((s) => [s.id, s]));
  const bMap = new Map(batches.map((b) => [b.id, b]));
  return records.map((r) => ({ ...r, studentId: sMap.get(r.studentId) || r.studentId, batchId: bMap.get(r.batchId) || r.batchId }));
}

export async function getStudentGrades(orgId: string, studentId: string) {
  const records = await db.lmsGradeRecord.findMany({
    where: { orgId, studentId }, orderBy: [{ academicYear: 'desc' }, { subject: 'asc' }],
  });
  return enrichRecords(records);
}

export async function getTranscript(orgId: string, studentId: string, academicYear?: string) {
  const records = await db.lmsGradeRecord.findMany({
    where: { orgId, studentId, ...(academicYear ? { academicYear } : {}) },
    orderBy: [{ academicYear: 'desc' }, { term: 'asc' }, { subject: 'asc' }],
  });
  return enrichRecords(records);
}

export async function getClassRanking(orgId: string, batchId: string, term?: string) {
  const records = await db.lmsGradeRecord.findMany({
    where: { orgId, batchId, ...(term ? { term } : {}) },
    // `nulls: 'last'` is required for parity: Mongo sorts null LAST on a
    // descending sort, Postgres puts NULLS FIRST — so any record written before
    // compute ran was ranking #1 in the class.
    orderBy: { overallPercentage: { sort: 'desc', nulls: 'last' } },
  });
  return enrichRecords(records);
}

export async function computeBatchGrades(orgId: string, batchId: string, term?: string) {
  const batch = await db.lmsBatch.findFirst({ where: { id: batchId, orgId } });
  if (!batch) throw NotFound('Batch not found');
  const students = await db.lmsBatchStudent.findMany({ where: { batchId }, select: { studentId: true } });
  const grades = await Promise.all(students.map((s) => computeStudentGrades(orgId, s.studentId, batchId, term)));
  return { batchId, studentsProcessed: grades.length, grades };
}
