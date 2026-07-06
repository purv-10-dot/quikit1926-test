/**
 * Attendance service — ported from NestJS AttendanceService (Mongoose → Prisma).
 * Tenant scoping via explicit tenantId arguments. The credit-deduction-on-mark
 * flow (zero-credit policy gating + FIFO deduction via credits-service) is ported
 * faithfully. The non-blocking payout auto-generation and parent zero-credit
 * notification are owned by the worker process (Phase 4) and reduced to no-ops.
 */
import type { Prisma, AttendanceStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, BadRequest, Forbidden, NotFound } from '@/lib/http';
import { deductCredit, getZeroCreditStatus } from './credits-service';
import { markAttendanceTimestamp } from './scheduling-service';

interface StudentAttendanceInput {
  studentId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface MarkAttendanceInput {
  scheduledClassId: string;
  batchId?: string;
  classDate?: string;
  students: StudentAttendanceInput[];
}

export interface EditAttendanceInput {
  status: AttendanceStatus;
  reason: string;
  notes?: string;
}

// ═══════════════ MARK ATTENDANCE (BULK) ═══════════════
export async function markAttendance(tenantId: string, dto: MarkAttendanceInput, markedBy: string) {
  const scheduledClass = await prisma.scheduledClass.findFirst({
    where: { id: dto.scheduledClassId, tenantId },
  });
  if (!scheduledClass) throw NotFound('Scheduled class not found');

  const batchId = dto.batchId || scheduledClass.batchId;
  const classDate = dto.classDate ? new Date(dto.classDate) : scheduledClass.startTime;

  const existing = await prisma.attendance.findFirst({ where: { scheduledClassId: dto.scheduledClassId } });
  if (existing) throw BadRequest('Attendance has already been marked for this class');

  const records: Array<{ status: AttendanceStatus }> = [];
  const warnings: string[] = [];

  for (const student of dto.students) {
    let attendance = await prisma.attendance.create({
      data: {
        tenantId,
        scheduledClassId: dto.scheduledClassId,
        batchId,
        studentId: student.studentId,
        markedBy,
        status: student.status,
        classDate,
        notes: student.notes,
      },
    });

    if (student.status === 'present' || student.status === 'late') {
      let creditAmount = 1;
      try {
        const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { creditPerClass: true } });
        creditAmount = batch?.creditPerClass ?? 1;
      } catch {
        /* use default */
      }

      try {
        const zeroCreditStatus = await getZeroCreditStatus(tenantId, student.studentId);
        if (!zeroCreditStatus.hasCredits) {
          const policy = zeroCreditStatus.policy;
          if (policy === 'block') {
            warnings.push(`${student.studentId}: Blocked — no credits available (policy: block)`);
            records.push(attendance);
            continue;
          } else if (policy === 'grace') {
            if (zeroCreditStatus.graceClassesUsed >= zeroCreditStatus.gracePeriodClasses) {
              warnings.push(
                `${student.studentId}: Blocked — grace period exhausted (${zeroCreditStatus.graceClassesUsed}/${zeroCreditStatus.gracePeriodClasses})`,
              );
              records.push(attendance);
              continue;
            }
            warnings.push(
              `${student.studentId}: Grace class used (${zeroCreditStatus.graceClassesUsed + 1}/${zeroCreditStatus.gracePeriodClasses})`,
            );
            attendance = await prisma.attendance.update({
              where: { id: attendance.id },
              data: { creditDeducted: false },
            });
            // Parent zero-credit notification → worker (Phase 4).
            records.push(attendance);
            continue;
          }
          // policy === 'warn': fall through to attempt deduction (will fail gracefully)
        }
      } catch {
        /* continue with normal deduction */
      }

      try {
        const creditResult = await deductCredit(
          tenantId,
          student.studentId,
          dto.scheduledClassId,
          attendance.id,
          creditAmount,
        );
        attendance = await prisma.attendance.update({
          where: { id: attendance.id },
          data: { creditDeducted: true, creditTransactionId: creditResult.transactionId },
        });
        if (creditResult.warnings.length > 0) {
          warnings.push(...creditResult.warnings.map((w) => `${student.studentId}: ${w}`));
        }
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 400) {
          warnings.push(`${student.studentId}: No credits available - attendance marked without deduction`);
        } else {
          throw error;
        }
      }
    }

    records.push(attendance);
  }

  await markAttendanceTimestamp(dto.scheduledClassId);

  // Auto payout generation → worker (Phase 4), non-blocking in legacy.

  return {
    success: true,
    recordsCreated: records.length,
    warnings,
    summary: {
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      late: records.filter((r) => r.status === 'late').length,
      excused: records.filter((r) => r.status === 'excused').length,
    },
  };
}

// ═══════════════ GET CLASS ATTENDANCE ═══════════════
export async function getClassAttendance(tenantId: string, classId: string) {
  const records = await prisma.attendance.findMany({
    where: { tenantId, scheduledClassId: classId },
  });
  return hydrateAttendance(records, {
    studentSelect: { id: true, firstName: true, lastName: true, email: true, grade: true, studentId: true },
    withMarkedBy: true,
  });
}

// ═══════════════ GET STUDENT ATTENDANCE HISTORY ═══════════════
export async function getStudentAttendance(tenantId: string, studentId: string, startDate?: string, endDate?: string) {
  const where: Prisma.AttendanceWhereInput = { tenantId, studentId };
  applyClassDateRange(where, startDate, endDate);

  const records = await prisma.attendance.findMany({ where, orderBy: { classDate: 'desc' } });

  // populate scheduledClassId (title,startTime,endTime) + batchId (name,subject,grade)
  const classIds = Array.from(new Set(records.map((r) => r.scheduledClassId)));
  const batchIds = Array.from(new Set(records.map((r) => r.batchId)));
  const [classes, batches] = await Promise.all([
    prisma.scheduledClass.findMany({ where: { id: { in: classIds } }, select: { id: true, title: true, startTime: true, endTime: true } }),
    prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, name: true, subject: true, grade: true } }),
  ]);
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  return records.map((r) => ({
    ...r,
    scheduledClassId: classMap.get(r.scheduledClassId) ?? r.scheduledClassId,
    batchId: batchMap.get(r.batchId) ?? r.batchId,
  }));
}

// ═══════════════ GET BATCH ATTENDANCE REPORT ═══════════════
export async function getBatchReport(tenantId: string, batchId: string, startDate?: string, endDate?: string) {
  const where: Prisma.AttendanceWhereInput = { tenantId, batchId };
  applyClassDateRange(where, startDate, endDate);

  const rawRecords = await prisma.attendance.findMany({ where, orderBy: { classDate: 'desc' } });

  const records = await hydrateAttendance(rawRecords, {
    studentSelect: { id: true, firstName: true, lastName: true, grade: true, studentId: true },
    classSelect: { id: true, title: true, startTime: true },
  });

  const studentMap: Record<string, { student: unknown; present: number; absent: number; late: number; excused: number; total: number }> = {};
  for (const record of records) {
    const studentObj = record.studentId as { id?: string } | string;
    const sid = typeof studentObj === 'object' ? studentObj.id : undefined;
    if (!sid) continue;
    if (!studentMap[sid]) {
      studentMap[sid] = { student: record.studentId, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    }
    studentMap[sid][record.status as 'present' | 'absent' | 'late' | 'excused']++;
    studentMap[sid].total++;
  }

  return {
    records,
    summary: Object.values(studentMap).map((s) => ({
      ...s,
      attendanceRate: s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0,
    })),
  };
}

// ═══════════════ EDIT ATTENDANCE ═══════════════
export async function editAttendance(
  tenantId: string,
  attendanceId: string,
  dto: EditAttendanceInput,
  editedBy: string,
  userRole?: string,
) {
  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, tenantId } });
  if (!attendance) throw NotFound('Attendance record not found');

  if (userRole === 'TEACHER' && attendance.markedBy !== editedBy) {
    throw Forbidden('Teachers can only edit attendance records they marked');
  }

  return prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      status: dto.status,
      editedBy,
      editReason: dto.reason,
      editedAt: new Date(),
      ...(dto.notes ? { notes: dto.notes } : {}),
    },
  });
}

// ───────────── helpers ─────────────
function applyClassDateRange(where: Prisma.AttendanceWhereInput, startDate?: string, endDate?: string) {
  if (startDate || endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (startDate) range.gte = new Date(startDate);
    if (endDate) range.lte = new Date(endDate);
    where.classDate = range;
  }
}

async function hydrateAttendance(
  records: Array<Record<string, unknown> & { studentId: string; markedBy: string; scheduledClassId: string }>,
  opts: { studentSelect: Prisma.UserSelect; withMarkedBy?: boolean; classSelect?: Prisma.ScheduledClassSelect },
) {
  const studentIds = Array.from(new Set(records.map((r) => r.studentId)));
  const students = studentIds.length
    ? await prisma.user.findMany({ where: { id: { in: studentIds } }, select: opts.studentSelect })
    : [];
  const studentMap = new Map(students.map((s) => [(s as { id: string }).id, s]));

  let markedByMap = new Map<string, unknown>();
  if (opts.withMarkedBy) {
    const markerIds = Array.from(new Set(records.map((r) => r.markedBy)));
    const markers = markerIds.length
      ? await prisma.user.findMany({ where: { id: { in: markerIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    markedByMap = new Map(markers.map((m) => [m.id, m]));
  }

  let classMap = new Map<string, unknown>();
  if (opts.classSelect) {
    const classIds = Array.from(new Set(records.map((r) => r.scheduledClassId)));
    const classes = classIds.length
      ? await prisma.scheduledClass.findMany({ where: { id: { in: classIds } }, select: opts.classSelect })
      : [];
    classMap = new Map(classes.map((c) => [(c as { id: string }).id, c]));
  }

  const shaped = records.map((r) => {
    const out: Record<string, unknown> = { ...r, studentId: studentMap.get(r.studentId) ?? r.studentId };
    if (opts.withMarkedBy) out.markedBy = markedByMap.get(r.markedBy) ?? r.markedBy;
    if (opts.classSelect) out.scheduledClassId = classMap.get(r.scheduledClassId) ?? r.scheduledClassId;
    return out;
  });

  // Legacy sorted by studentId.firstName ascending for class attendance.
  if (opts.withMarkedBy) {
    shaped.sort((a, b) => {
      const an = (a.studentId as { firstName?: string })?.firstName || '';
      const bn = (b.studentId as { firstName?: string })?.firstName || '';
      return an.localeCompare(bn);
    });
  }
  return shaped;
}
