/**
 * Tutoring-requests service — ported from NestJS TutoringRequestsService
 * (Mongoose → Prisma). Tenant isolation via explicit orgId args.
 *
 * Cross-module dependencies that the legacy injected are reproduced inline against
 * Prisma so this module is self-contained (lib/services/* may not be modified):
 *  - Credit hold/release/finalize logic (FIFO) ported from CreditsService.
 *  - One-on-one batch + class + meeting setup ported from BatchesService /
 *    SchedulingService / MeetingsService. Class generation reuses the existing
 *    lib scheduling-service.generateClasses(); meetings reuse lib meetings-service.
 *  - Confirmation / rejection / completion emails are sent inline here, matching
 *    the legacy service. Every send is best-effort: a mail failure must never
 *    roll back the batch, credits or payout it is reporting on.
 *
 * Mongo populate() of teacher/student reproduced with manual lookups.
 */
import type { Prisma, LmsTutoringRequestStatus as TutoringRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest, Internal } from '@/lib/http';
import { sendEmail } from '@/lib/email';
import { generateClasses, validateTeacherSchedule } from '@/lib/services/scheduling-service';
import { createMeeting } from '@/lib/services/meetings-service';

type Slot = { date: string; startTime: string; endTime: string };

const STUDENT_SELECT = { id: true, firstName: true, lastName: true, email: true, grade: true, section: true } as const;
const TEACHER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

/**
 * Best-effort transactional mail. The legacy chained `.catch()` onto every
 * `emailService.sendEmail` call for the same reason: a dead SMTP host must not
 * undo an accepted session, a released credit hold or a created payout.
 */
async function trySend(input: Parameters<typeof sendEmail>[0], label: string): Promise<void> {
  try {
    await sendEmail(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[tutoring] ${label} email failed (non-fatal):`, err);
  }
}

async function shapeOne(id: string) {
  const r = await prisma.lmsTutoringRequest.findUnique({ where: { id } });
  if (!r) return null;
  const student = r.studentId ? await prisma.lmsUser.findUnique({ where: { id: r.studentId }, select: STUDENT_SELECT }) : null;
  const teacher = r.teacherId ? await prisma.lmsUser.findUnique({ where: { id: r.teacherId }, select: TEACHER_SELECT }) : null;
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
  const students = await prisma.lmsUser.findMany({ where: { id: { in: studentIds } }, select: STUDENT_SELECT });
  const teachers = await prisma.lmsUser.findMany({ where: { id: { in: teacherIds } }, select: TEACHER_SELECT });
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
async function getStudentBalance(orgId: string, studentId: string) {
  const packages = await prisma.lmsCreditPackage.findMany({
    where: { orgId, studentId, status: 'active' },
    orderBy: { expiresAt: { sort: 'asc', nulls: 'first' } }, // Mongo sorts nulls first — see credits-service.deductCredit
  });
  const available = packages.reduce((sum, p) => sum + p.remainingCredits, 0);
  return { available };
}

async function holdCredit(orgId: string, studentId: string, amount: number, notes: string): Promise<string> {
  const packages = await prisma.lmsCreditPackage.findMany({
    where: { orgId, studentId, status: 'active', remainingCredits: { gt: 0 } },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'first' } }, { purchaseDate: 'asc' }], // Mongo sorts nulls first
  });
  if (packages.length === 0) throw BadRequest('No credits available for this student');

  const pkg = packages[0];
  const newRemaining = pkg.remainingCredits - amount;
  await prisma.lmsCreditPackage.update({
    where: { id: pkg.id },
    data: {
      usedCredits: pkg.usedCredits + amount,
      remainingCredits: Math.max(0, newRemaining),
      status: newRemaining <= 0 ? 'exhausted' : pkg.status,
    },
  });

  const transaction = await prisma.lmsCreditTransaction.create({
    data: {
      orgId,
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
  const transaction = await prisma.lmsCreditTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw NotFound('Transaction not found');
  const pkg = await prisma.lmsCreditPackage.findUnique({ where: { id: transaction.packageId } });
  if (!pkg) throw NotFound('Package not found for this transaction');

  const amountToRefund = Math.abs(transaction.amount);
  const newRemaining = pkg.remainingCredits + amountToRefund;
  await prisma.lmsCreditPackage.update({
    where: { id: pkg.id },
    data: {
      usedCredits: Math.max(0, pkg.usedCredits - amountToRefund),
      remainingCredits: newRemaining,
      status: newRemaining > 0 && pkg.status === 'exhausted' ? 'active' : pkg.status,
    },
  });
  await prisma.lmsCreditTransaction.create({
    data: {
      orgId: transaction.orgId,
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
export async function getAvailableTeachers(orgId: string) {
  const teachers = await prisma.lmsUser.findMany({
    where: { orgId, role: 'TEACHER', isActive: true, tutoringEnabled: true, tutoringCreditCost: { gt: 0 } },
    select: {
      id: true, firstName: true, lastName: true, email: true, subjects: true, tutoringCreditCost: true,
      availableSlots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return teachers.map((t) => ({ _id: t.id, ...t }));
}

export async function create(
  orgId: string,
  studentId: string,
  dto: { subject: string; notes?: string; proposedSlots: Slot[]; teacherId?: string },
) {
  if (!studentId) throw BadRequest('Student ID is required');

  const teacher = dto.teacherId
    ? await prisma.lmsUser.findFirst({ where: { id: dto.teacherId, orgId, role: 'TEACHER' } })
    : null;
  if (!teacher) throw NotFound('Teacher not found');
  if (!teacher.tutoringEnabled) throw BadRequest('Teacher is not available for tutoring');
  if (!teacher.tutoringCreditCost || teacher.tutoringCreditCost <= 0) throw BadRequest('Teacher tutoring rate not configured');

  const creditCostSnapshot = teacher.tutoringCreditCost;
  const teacherRateSnapshot = teacher.ratePerClass || 0;

  const balance = await getStudentBalance(orgId, studentId);
  if (balance.available < creditCostSnapshot) {
    throw BadRequest(
      `Insufficient credits. This session costs ${creditCostSnapshot} credits. Your balance: ${balance.available} credits.`,
    );
  }

  let creditHoldId: string;
  try {
    creditHoldId = await holdCredit(orgId, studentId, creditCostSnapshot, 'Hold for tutoring request - pending teacher acceptance');
  } catch (err) {
    throw BadRequest(`Failed to reserve credits: ${(err as Error).message}`);
  }

  try {
    const doc = await prisma.lmsTutoringRequest.create({
      data: {
        orgId,
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

export async function getForStudent(orgId: string, studentId: string) {
  if (!studentId) return [];
  const rows = await prisma.lmsTutoringRequest.findMany({ where: { orgId, studentId }, orderBy: { createdAt: 'desc' } });
  return shapeMany(rows);
}

export async function getForTeacher(orgId: string, teacherId: string) {
  if (!teacherId) return [];
  const rows = await prisma.lmsTutoringRequest.findMany({
    where: {
      orgId,
      OR: [{ teacherId }, { teacherId: null, status: 'pending' }],
    },
    orderBy: { createdAt: 'desc' },
  });
  return shapeMany(rows);
}

export async function getForAdmin(orgId: string, query: { status?: string; studentId?: string; teacherId?: string }) {
  const where: Prisma.LmsTutoringRequestWhereInput = { orgId };
  if (query.status) where.status = query.status as TutoringRequestStatus;
  if (query.studentId) where.studentId = query.studentId;
  if (query.teacherId) where.teacherId = query.teacherId;
  const rows = await prisma.lmsTutoringRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  return shapeMany(rows);
}

// ═══════════════ ACCEPT ═══════════════
export async function accept(
  orgId: string,
  teacherId: string,
  requestId: string,
  dto: { confirmedSlot: Slot; teacherNotes?: string },
) {
  const request = await prisma.lmsTutoringRequest.findFirst({ where: { id: requestId, orgId, status: 'pending' } });
  if (!request) throw NotFound('Tutoring request not found or not in pending state');

  const confirmedDate = new Date(dto.confirmedSlot.date);
  const dayOfWeek = confirmedDate.getDay();
  const dateStr = confirmedDate.toISOString().split('T')[0];

  /**
   * Teacher double-booking guard — restored.
   *
   * The legacy routed this through `BatchesService.create`
   * (`tutoring-requests.service.ts:202-222`), which runs
   * `validateTeacherSchedule` (`batches.service.ts:66-76`) and throws a 400 with
   * the conflict reason if the confirmed slot collides with an existing batch.
   * The port inlined a raw `lmsBatch.create`, so none of that ran: a teacher
   * accepting a request for a slot they already teach silently got an
   * overlapping batch, class AND video meeting — two live classes at once.
   */
  const conflicts = await validateTeacherSchedule(teacherId, [
    { dayOfWeek, startTime: dto.confirmedSlot.startTime, endTime: dto.confirmedSlot.endTime },
  ]);
  const blocked = conflicts.find((c) => !c.available);
  if (blocked) throw BadRequest(blocked.reason || 'Teacher is not available for the confirmed slot');

  // 2. Create the one-on-one batch (BatchesService.create equivalent)
  let batch;
  try {
    batch = await prisma.lmsBatch.create({
      data: {
        orgId,
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

  // Hoisted so the catch below can persist it — see the rollback note there.
  let createdClassId: string | null = null;

  try {
    // 3. Generate the class session for this batch
    let scheduledClass: { id: string; startTime: Date; endTime: Date } | null = null;
    const existing = await prisma.lmsScheduledClass.findFirst({ where: { batchId: batch.id }, orderBy: { startTime: 'asc' } });
    if (existing) {
      scheduledClass = existing;
    } else {
      const classes = (await generateClasses(orgId, { batchId: batch.id })) as { id: string; startTime: Date; endTime: Date }[];
      if (!classes || classes.length === 0) throw new Error('No class sessions generated');
      scheduledClass = classes[0];
    }
    createdClassId = scheduledClass.id;

    // 4. Create the meeting (provider from tenant videoConfig, default jitsi)
    let provider: 'zoom' | 'google_meet' | 'jitsi' | 'manual' = 'jitsi';
    try {
      const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId } });
      const p = (tenant as Record<string, any> | null)?.videoConfig?.provider;
      if (p) provider = p;
    } catch {
      /* fallback to jitsi */
    }

    const meeting = await createMeeting(
      orgId,
      {
        title: `Tutoring: ${request.subject}`,
        scheduledStartTime: scheduledClass.startTime.toISOString(),
        scheduledEndTime: scheduledClass.endTime.toISOString(),
        scheduledClassId: scheduledClass.id,
        provider,
      },
      teacherId,
    );

    // 5. Finalize the request
    await prisma.lmsTutoringRequest.update({
      where: { id: request.id },
      data: {
        batchId: batch.id,
        scheduledClassId: scheduledClass.id,
        confirmedSlot: dto.confirmedSlot as unknown as Prisma.InputJsonValue,
        teacherNotes: dto.teacherNotes,
        status: 'accepted',
      },
    });

    // 6. Notifications — student gets the JOIN link, teacher the HOST link.
    //    Wrapped whole: nothing in here may reach the rollback catch below.
    try {
      const student = await prisma.lmsUser.findUnique({ where: { id: request.studentId }, select: TEACHER_SELECT });
      const teacher = await prisma.lmsUser.findUnique({ where: { id: teacherId }, select: TEACHER_SELECT });

      if (student && teacher) {
        const timeStr = `${dto.confirmedSlot.startTime} - ${dto.confirmedSlot.endTime}`;

        await trySend(
          {
            to: student.email,
            subject: 'Tutoring Session Confirmed',
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Your Tutoring Session is Confirmed!</h2>
              <p>Hi ${student.firstName},</p>
              <p>Your tutoring request has been accepted by <strong>${teacher.firstName} ${teacher.lastName}</strong>.</p>
              <div style="background: #f4f7fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Subject:</strong> ${request.subject}</p>
                <p><strong>Date:</strong> ${dateStr}</p>
                <p><strong>Time:</strong> ${timeStr}</p>
              </div>
              <p>You can join the session using the link below at the scheduled time:</p>
              <p><a href="${meeting.joinUrl}" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Session</a></p>
            </div>
          `,
          },
          'student confirmation',
        );

        // The legacy body printed the literal `Student ID: <ObjectId>` — the
        // student record is already loaded here, so the teacher gets a name.
        await trySend(
          {
            to: teacher.email,
            subject: 'New Tutoring Session Confirmed',
            html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>You have a new tutoring session!</h2>
              <p>Hi ${teacher.firstName},</p>
              <p>You have successfully accepted the tutoring request from <strong>${student.firstName} ${student.lastName}</strong>.</p>
              <div style="background: #f4f7fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Subject:</strong> ${request.subject}</p>
                <p><strong>Date:</strong> ${dateStr}</p>
                <p><strong>Time:</strong> ${timeStr}</p>
              </div>
              <p>Host the session using your dashboard or the link below:</p>
              <p><a href="${meeting.hostUrl || meeting.joinUrl}" style="background: #764ba2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Host Session</a></p>
            </div>
          `,
          },
          'teacher confirmation',
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[tutoring] confirmation notifications failed (non-fatal):', err);
    }
  } catch {
    // Partial rollback: keep batchId AND scheduledClassId, leave request pending.
    // The legacy assigned scheduledClassId onto the document before meeting
    // creation and persisted both in its catch (`tutoring-requests.service.ts:254,331`).
    // Dropping it orphaned the generated class: nothing could re-associate it,
    // and the payout path keys `completedClasses` off `scheduledClassId`.
    await prisma.lmsTutoringRequest
      .update({
        where: { id: request.id },
        data: { batchId: batch.id, ...(createdClassId ? { scheduledClassId: createdClassId } : {}) },
      })
      .catch(() => {});
    throw Internal('Session setup incomplete. Admin has been notified.');
  }

  return shapeOne(request.id);
}

// ═══════════════ REJECT ═══════════════
export async function reject(
  orgId: string,
  teacherId: string,
  requestId: string,
  dto: { rejectionReason?: string },
) {
  const request = await prisma.lmsTutoringRequest.findFirst({ where: { id: requestId, orgId, status: 'pending' } });
  if (!request) throw NotFound('Tutoring request not found or not in pending state');

  if (request.creditHoldId) {
    await revertDeduction(request.creditHoldId, 'Tutoring request rejected - credits released').catch(() => {});
  }

  await prisma.lmsTutoringRequest.update({
    where: { id: request.id },
    data: { teacherId, rejectionReason: dto.rejectionReason, status: 'rejected' },
  });

  // 3. Notify the student — the credits are already back, so say so.
  try {
    const student = await prisma.lmsUser.findUnique({
      where: { id: request.studentId },
      select: { firstName: true, email: true },
    });
    if (student) {
      await trySend(
        {
          to: student.email,
          subject: 'Tutoring Request Update',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Tutoring Request Declined</h2>
              <p>Hi ${student.firstName},</p>
              <p>Your tutoring request for <strong>${request.subject}</strong> was declined.</p>
              <p><strong>Reason:</strong> ${dto.rejectionReason || 'No reason provided.'}</p>
              <p>Your <strong>${request.creditCostSnapshot || 0} credits</strong> have been returned to your account.</p>
              <p>You can browse other teachers and try again.</p>
            </div>
          `,
        },
        'student rejection',
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tutoring] rejection notification failed (non-fatal):', err);
  }

  return shapeOne(request.id);
}

// ═══════════════ MARK COMPLETED ═══════════════
export async function markCompleted(orgId: string, requestId: string) {
  const request = await prisma.lmsTutoringRequest.findFirst({ where: { id: requestId, orgId, status: 'accepted' } });
  if (!request) throw NotFound('Accepted tutoring request not found');

  // 1. Finalize credit deduction (convert the hold into a deduction)
  if (request.creditHoldId) {
    await prisma.lmsCreditTransaction
      .update({
        where: { id: request.creditHoldId },
        data: { transactionType: 'tutoring_deduction', notes: `Tutoring session completed - ${request.subject}` },
      })
      .catch(() => {});
  }

  // 2. Create the teacher payout entry
  // Hoisted out of the try because the completion email below reuses it — the
  // legacy declared it the same way (`tutoring-requests.service.ts:426`).
  let studentName = `Student ID: ${request.studentId}`;
  try {
    const confirmed = request.confirmedSlot as unknown as Slot | null;
    if (confirmed?.date) {
      const confirmedDate = new Date(confirmed.date);
      const periodStart = new Date(new Date(confirmedDate).setHours(0, 0, 0, 0));
      const periodEnd = new Date(new Date(confirmedDate).setHours(23, 59, 59, 999));

      const student = await prisma.lmsUser.findUnique({ where: { id: request.studentId }, select: { firstName: true, lastName: true } });
      if (student) studentName = `${student.firstName} ${student.lastName}`;

      await prisma.lmsTeacherPayout.create({
        data: {
          orgId,
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
  await prisma.lmsTutoringRequest.update({ where: { id: request.id }, data: { status: 'completed' } });

  // 4. Completion emails — student (credits deducted) + teacher (payout pending).
  try {
    const student = await prisma.lmsUser.findUnique({
      where: { id: request.studentId },
      select: { firstName: true, email: true },
    });
    const teacher = request.teacherId
      ? await prisma.lmsUser.findUnique({ where: { id: request.teacherId }, select: { firstName: true, email: true } })
      : null;

    if (student) {
      await trySend(
        {
          to: student.email,
          subject: 'Tutoring Session Completed',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Your Tutoring Session is Complete!</h2>
              <p>Hi ${student.firstName},</p>
              <p>Your tutoring session for <strong>${request.subject}</strong> is complete.</p>
              <p><strong>${request.creditCostSnapshot || 0} credits</strong> have been deducted from your wallet.</p>
              <p>We hope you had a great learning experience!</p>
            </div>
          `,
        },
        'student completion',
      );
    }

    if (teacher) {
      await trySend(
        {
          to: teacher.email,
          subject: 'Tutoring Session Completed',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Session Completed</h2>
              <p>Hi ${teacher.firstName},</p>
              <p>Your session with <strong>${studentName || 'your student'}</strong> for <strong>${request.subject}</strong> is complete.</p>
              <p>A payout of <strong>₹${request.teacherRateSnapshot || 0}</strong> is now pending approval in your dashboard.</p>
            </div>
          `,
        },
        'teacher completion',
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tutoring] completion notifications failed (non-fatal):', err);
  }

  return shapeOne(request.id);
}
