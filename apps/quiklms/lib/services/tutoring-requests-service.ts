/**
 * Tutoring-requests service — ported from NestJS TutoringRequestsService
 * (Mongoose → Prisma). Tenant isolation via explicit tenantId args.
 *
 * Cross-module dependencies that the legacy injected are reproduced inline against
 * Prisma so this module is self-contained (lib/services/* may not be modified):
 *  - Credit hold/release/finalize logic (FIFO) ported from CreditsService.
 *  - One-on-one batch + class + meeting setup ported from BatchesService /
 *    SchedulingService / MeetingsService. Class generation reuses the existing
 *    lib scheduling-service.generateClasses(); meetings reuse lib meetings-service.
 *  - Email notifications are no-ops here — confirmation/rejection/completion email
 *    dispatch is owned by the worker (Phase 4); the DB state is fully preserved.
 *
 * Mongo populate() of teacher/student reproduced with manual lookups.
 */
import type { Prisma, TutoringRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest, Internal } from '@/lib/http';
import { generateClasses } from '@/lib/services/scheduling-service';
import { createMeeting } from '@/lib/services/meetings-service';

type Slot = { date: string; startTime: string; endTime: string };

const STUDENT_SELECT = { id: true, firstName: true, lastName: true, email: true, grade: true, section: true } as const;
const TEACHER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

async function shapeOne(id: string) {
  const r = await prisma.tutoringRequest.findUnique({ where: { id } });
  if (!r) return null;
  const student = r.studentId ? await prisma.user.findUnique({ where: { id: r.studentId }, select: STUDENT_SELECT }) : null;
  const teacher = r.teacherId ? await prisma.user.findUnique({ where: { id: r.teacherId }, select: TEACHER_SELECT }) : null;
  return {
    _id: r.id,
    ...r,
    studentId: student ? { _id: student.id, ...student } : r.studentId,
    teacherId: teacher ? { _id: teacher.id, ...teacher } : r.teacherId,
  };
}

async function shapeMany(rows: { id: string; studentId: string; teacherId: string | null }[]) {
  const studentIds = rows.map((r) => r.studentId);
  const teacherIds = rows.map((r) => r.teacherId).filter(Boolean) as string[];
  const students = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: STUDENT_SELECT });
  const teachers = await prisma.user.findMany({ where: { id: { in: teacherIds } }, select: TEACHER_SELECT });
  const smap = new Map(students.map((s) => [s.id, { _id: s.id, ...s }]));
  const tmap = new Map(teachers.map((t) => [t.id, { _id: t.id, ...t }]));
  return rows.map((r) => ({
    ...(r as Record<string, unknown>),
    _id: r.id,
    studentId: smap.get(r.studentId) ?? r.studentId,
    teacherId: r.teacherId ? tmap.get(r.teacherId) ?? r.teacherId : r.teacherId,
  }));
}

// ═══════════════ CREDIT HELPERS (ported from CreditsService) ═══════════════
async function getStudentBalance(tenantId: string, studentId: string) {
  const packages = await prisma.creditPackage.findMany({
    where: { tenantId, studentId, status: 'active' },
    orderBy: { expiresAt: 'asc' },
  });
  const available = packages.reduce((sum, p) => sum + p.remainingCredits, 0);
  return { available };
}

async function holdCredit(tenantId: string, studentId: string, amount: number, notes: string): Promise<string> {
  const packages = await prisma.creditPackage.findMany({
    where: { tenantId, studentId, status: 'active', remainingCredits: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { purchaseDate: 'asc' }],
  });
  if (packages.length === 0) throw BadRequest('No credits available for this student');

  const pkg = packages[0];
  const newRemaining = pkg.remainingCredits - amount;
  await prisma.creditPackage.update({
    where: { id: pkg.id },
    data: {
      usedCredits: pkg.usedCredits + amount,
      remainingCredits: Math.max(0, newRemaining),
      status: newRemaining <= 0 ? 'exhausted' : pkg.status,
    },
  });

  const transaction = await prisma.creditTransaction.create({
    data: {
      tenantId,
      packageId: pkg.id,
      studentId,
      transactionType: 'tutoring_hold',
      amount: -amount,
      balanceAfter: Math.max(0, newRemaining),
      notes,
    },
  });
  return transaction.id;
}

async function revertDeduction(transactionId: string, customNotes?: string) {
  const transaction = await prisma.creditTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw NotFound('Transaction not found');
  const pkg = await prisma.creditPackage.findUnique({ where: { id: transaction.packageId } });
  if (!pkg) throw NotFound('Package not found for this transaction');

  const amountToRefund = Math.abs(transaction.amount);
  const newRemaining = pkg.remainingCredits + amountToRefund;
  await prisma.creditPackage.update({
    where: { id: pkg.id },
    data: {
      usedCredits: Math.max(0, pkg.usedCredits - amountToRefund),
      remainingCredits: newRemaining,
      status: newRemaining > 0 && pkg.status === 'exhausted' ? 'active' : pkg.status,
    },
  });
  await prisma.creditTransaction.create({
    data: {
      tenantId: transaction.tenantId,
      packageId: pkg.id,
      studentId: transaction.studentId,
      transactionType: 'tutoring_hold_release',
      amount: amountToRefund,
      balanceAfter: newRemaining,
      notes: customNotes || `Tutoring hold reversal for transaction ${transactionId}`,
    },
  });
}

// ═══════════════ READ ENDPOINTS ═══════════════
export async function getAvailableTeachers(tenantId: string) {
  const teachers = await prisma.user.findMany({
    where: { tenantId, role: 'TEACHER', isActive: true, tutoringEnabled: true, tutoringCreditCost: { gt: 0 } },
    select: {
      id: true, firstName: true, lastName: true, email: true, subjects: true, tutoringCreditCost: true,
      availableSlots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return teachers.map((t) => ({ _id: t.id, ...t }));
}

export async function create(
  tenantId: string,
  studentId: string,
  dto: { subject: string; notes?: string; proposedSlots: Slot[]; teacherId?: string },
) {
  if (!studentId) throw BadRequest('Student ID is required');

  const teacher = dto.teacherId
    ? await prisma.user.findFirst({ where: { id: dto.teacherId, tenantId, role: 'TEACHER' } })
    : null;
  if (!teacher) throw NotFound('Teacher not found');
  if (!teacher.tutoringEnabled) throw BadRequest('Teacher is not available for tutoring');
  if (!teacher.tutoringCreditCost || teacher.tutoringCreditCost <= 0) throw BadRequest('Teacher tutoring rate not configured');

  const creditCostSnapshot = teacher.tutoringCreditCost;
  const teacherRateSnapshot = teacher.ratePerClass || 0;

  const balance = await getStudentBalance(tenantId, studentId);
  if (balance.available < creditCostSnapshot) {
    throw BadRequest(
      `Insufficient credits. This session costs ${creditCostSnapshot} credits. Your balance: ${balance.available} credits.`,
    );
  }

  let creditHoldId: string;
  try {
    creditHoldId = await holdCredit(tenantId, studentId, creditCostSnapshot, 'Hold for tutoring request - pending teacher acceptance');
  } catch (err) {
    throw BadRequest(`Failed to reserve credits: ${(err as Error).message}`);
  }

  try {
    const doc = await prisma.tutoringRequest.create({
      data: {
        tenantId,
        studentId,
        teacherId: dto.teacherId,
        subject: dto.subject,
        notes: dto.notes,
        proposedSlots: dto.proposedSlots as unknown as Prisma.InputJsonValue,
        status: 'pending',
        creditCostSnapshot,
        teacherRateSnapshot,
        creditHoldId,
      },
    });
    return shapeOne(doc.id);
  } catch (err) {
    await revertDeduction(creditHoldId).catch(() => {});
    throw err;
  }
}

export async function getForStudent(tenantId: string, studentId: string) {
  if (!studentId) return [];
  const rows = await prisma.tutoringRequest.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' } });
  return shapeMany(rows);
}

export async function getForTeacher(tenantId: string, teacherId: string) {
  if (!teacherId) return [];
  const rows = await prisma.tutoringRequest.findMany({
    where: {
      tenantId,
      OR: [{ teacherId }, { teacherId: null, status: 'pending' }],
    },
    orderBy: { createdAt: 'desc' },
  });
  return shapeMany(rows);
}

export async function getForAdmin(tenantId: string, query: { status?: string; studentId?: string; teacherId?: string }) {
  const where: Prisma.TutoringRequestWhereInput = { tenantId };
  if (query.status) where.status = query.status as TutoringRequestStatus;
  if (query.studentId) where.studentId = query.studentId;
  if (query.teacherId) where.teacherId = query.teacherId;
  const rows = await prisma.tutoringRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  return shapeMany(rows);
}

// ═══════════════ ACCEPT ═══════════════
export async function accept(
  tenantId: string,
  teacherId: string,
  requestId: string,
  dto: { confirmedSlot: Slot; teacherNotes?: string },
) {
  const request = await prisma.tutoringRequest.findFirst({ where: { id: requestId, tenantId, status: 'pending' } });
  if (!request) throw NotFound('Tutoring request not found or not in pending state');

  const confirmedDate = new Date(dto.confirmedSlot.date);
  const dayOfWeek = confirmedDate.getDay();
  const dateStr = confirmedDate.toISOString().split('T')[0];

  // 2. Create the one-on-one batch (BatchesService.create equivalent)
  let batch;
  try {
    batch = await prisma.batch.create({
      data: {
        tenantId,
        name: `1:1 Tutoring - ${request.subject} - ${dateStr}`,
        subject: request.subject,
        teacherId,
        academicYear: `${confirmedDate.getFullYear()}-${confirmedDate.getFullYear() + 1}`,
        startDate: confirmedDate,
        endDate: confirmedDate,
        maxCapacity: 1,
        status: 'active',
        batchType: 'one_on_one',
        source: 'auto_tutoring',
        tutoringRequestId: request.id,
        creditPerClass: 0,
        ratePerClass: request.teacherRateSnapshot || 0,
        schedule: { create: [{ dayOfWeek, startTime: dto.confirmedSlot.startTime, endTime: dto.confirmedSlot.endTime }] },
        students: { create: [{ studentId: request.studentId }] },
      },
    });
  } catch (err) {
    throw err;
  }

  try {
    // 3. Generate the class session for this batch
    let scheduledClass: { id: string; startTime: Date; endTime: Date } | null = null;
    const existing = await prisma.scheduledClass.findFirst({ where: { batchId: batch.id }, orderBy: { startTime: 'asc' } });
    if (existing) {
      scheduledClass = existing;
    } else {
      const classes = (await generateClasses(tenantId, { batchId: batch.id })) as { id: string; startTime: Date; endTime: Date }[];
      if (!classes || classes.length === 0) throw new Error('No class sessions generated');
      scheduledClass = classes[0];
    }

    // 4. Create the meeting (provider from tenant videoConfig, default jitsi)
    let provider: 'zoom' | 'google_meet' | 'jitsi' | 'manual' = 'jitsi';
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const p = (tenant as Record<string, any> | null)?.videoConfig?.provider;
      if (p) provider = p;
    } catch {
      /* fallback to jitsi */
    }

    const meeting = await createMeeting(
      tenantId,
      {
        title: `Tutoring: ${request.subject}`,
        scheduledStartTime: scheduledClass.startTime.toISOString(),
        scheduledEndTime: scheduledClass.endTime.toISOString(),
        scheduledClassId: scheduledClass.id,
        provider,
      },
      teacherId,
    );
    void meeting; // join/host links are surfaced via the meeting record + worker emails

    // 5. Finalize the request
    await prisma.tutoringRequest.update({
      where: { id: request.id },
      data: {
        batchId: batch.id,
        scheduledClassId: scheduledClass.id,
        confirmedSlot: dto.confirmedSlot as unknown as Prisma.InputJsonValue,
        teacherNotes: dto.teacherNotes,
        status: 'accepted',
      },
    });

    // 6. Notifications — worker owns email dispatch (Phase 4).
  } catch {
    // Partial rollback: keep batchId if set, leave request pending — matches legacy.
    await prisma.tutoringRequest.update({ where: { id: request.id }, data: { batchId: batch.id } }).catch(() => {});
    throw Internal('Session setup incomplete. Admin has been notified.');
  }

  return shapeOne(request.id);
}

// ═══════════════ REJECT ═══════════════
export async function reject(
  tenantId: string,
  teacherId: string,
  requestId: string,
  dto: { rejectionReason?: string },
) {
  const request = await prisma.tutoringRequest.findFirst({ where: { id: requestId, tenantId, status: 'pending' } });
  if (!request) throw NotFound('Tutoring request not found or not in pending state');

  if (request.creditHoldId) {
    await revertDeduction(request.creditHoldId, 'Tutoring request rejected - credits released').catch(() => {});
  }

  await prisma.tutoringRequest.update({
    where: { id: request.id },
    data: { teacherId, rejectionReason: dto.rejectionReason, status: 'rejected' },
  });

  // Student rejection email — worker owns dispatch (Phase 4).
  return shapeOne(request.id);
}

// ═══════════════ MARK COMPLETED ═══════════════
export async function markCompleted(tenantId: string, requestId: string) {
  const request = await prisma.tutoringRequest.findFirst({ where: { id: requestId, tenantId, status: 'accepted' } });
  if (!request) throw NotFound('Accepted tutoring request not found');

  // 1. Finalize credit deduction (convert the hold into a deduction)
  if (request.creditHoldId) {
    await prisma.creditTransaction
      .update({
        where: { id: request.creditHoldId },
        data: { transactionType: 'tutoring_deduction', notes: `Tutoring session completed - ${request.subject}` },
      })
      .catch(() => {});
  }

  // 2. Create the teacher payout entry
  try {
    const confirmed = request.confirmedSlot as unknown as Slot | null;
    if (confirmed?.date) {
      const confirmedDate = new Date(confirmed.date);
      const periodStart = new Date(new Date(confirmedDate).setHours(0, 0, 0, 0));
      const periodEnd = new Date(new Date(confirmedDate).setHours(23, 59, 59, 999));

      const student = await prisma.user.findUnique({ where: { id: request.studentId }, select: { firstName: true, lastName: true } });
      const studentName = student ? `${student.firstName} ${student.lastName}` : `Student ID: ${request.studentId}`;

      await prisma.teacherPayout.create({
        data: {
          tenantId,
          teacherId: request.teacherId!,
          periodStart,
          periodEnd,
          ratePerClass: request.teacherRateSnapshot ?? 0,
          rateType: 'per_class',
          grossAmount: request.teacherRateSnapshot ?? 0,
          netAmount: request.teacherRateSnapshot ?? 0,
          status: 'pending',
          notes: `Tutoring session - ${request.subject} - student: ${studentName}`,
          source: 'tutoring',
          completedClasses: request.scheduledClassId
            ? { create: [{ scheduledClassId: request.scheduledClassId }] }
            : undefined,
        },
      });
    }
  } catch {
    // Do not throw — mark completed anyway, matching legacy.
  }

  // 3. Mark completed
  await prisma.tutoringRequest.update({ where: { id: request.id }, data: { status: 'completed' } });

  // 4. Completion emails — worker owns dispatch (Phase 4).
  return shapeOne(request.id);
}
