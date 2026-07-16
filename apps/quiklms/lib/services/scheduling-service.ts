/**
 * Scheduling service — ported from NestJS SchedulingService (Mongoose → Prisma).
 * Tenant isolation enforced by callers via tenantWhere/assertTenantMatch and the
 * explicit orgId arguments threaded through every query.
 *
 * Notes on the re-platform:
 *  - Mongo `populate()` of teacher/student/batch is reproduced with manual
 *    lookups (actor refs are scalar Strings, no Prisma relations), returning
 *    the same nested object shapes the legacy API produced.
 *  - Side-effects that depended on external infra (email join links, reminder
 *    scheduling, escalation resolution) are reduced to no-ops/logs — the worker
 *    process (Phase 4) owns those. The DB state transitions are preserved.
 */
import type { LmsClassStatus as ClassStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

type ScheduleSlot = { dayOfWeek: number; startTime: string; endTime: string; location?: string };

const ACTIVE = 'active' as const;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

const USER_NAME_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

async function userMap(ids: string[], select: Prisma.LmsUserSelect = USER_NAME_SELECT) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await prisma.lmsUser.findMany({ where: { id: { in: unique } }, select });
  return new Map(users.map((u) => [u.id, u as Record<string, unknown>]));
}

/** Shape a ScheduledClass + batch/teacher into the legacy populated form. */
function shapeClass(
  cls: Record<string, unknown>,
  batch: Record<string, unknown> | null,
  teacher: Record<string, unknown> | null,
  substituteTeacher?: Record<string, unknown> | null,
) {
  const out: Record<string, unknown> = { ...cls, batchId: batch ?? cls.batchId, teacherId: teacher ?? cls.teacherId };
  if (substituteTeacher !== undefined) out.substituteTeacherId = substituteTeacher ?? cls.substituteTeacherId;
  return out;
}

async function loadBatchLite(batchIds: string[]) {
  const unique = Array.from(new Set(batchIds.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const batches = await prisma.lmsBatch.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, grade: true, subject: true, students: { select: { studentId: true } } },
  });
  return new Map(
    batches.map((b) => [
      b.id,
      { _id: b.id, name: b.name, grade: b.grade, subject: b.subject, studentIds: b.students.map((s) => s.studentId) },
    ]),
  );
}

// ═══════════════ GENERATE CLASSES FROM BATCH SCHEDULE ═══════════════
export async function generateClasses(
  orgId: string,
  dto: { batchId: string; fromDate?: string; toDate?: string },
): Promise<unknown[]> {
  const batch = await prisma.lmsBatch.findFirst({
    where: { id: dto.batchId, orgId },
    include: { schedule: true },
  });
  if (!batch) throw NotFound('Batch not found');
  if (batch.status !== ACTIVE) throw BadRequest('Can only generate classes for active batches');

  const fromDate = dto.fromDate ? new Date(dto.fromDate) : new Date(batch.startDate);
  const toDate = dto.toDate ? new Date(dto.toDate) : new Date(batch.endDate);

  const existingClasses = await prisma.lmsScheduledClass.findMany({
    where: {
      orgId,
      batchId: batch.id,
      startTime: { gte: fromDate, lte: toDate },
      status: { notIn: ['cancelled', 'rescheduled'] },
    },
    select: { startTime: true },
  });
  const existingSet = new Set(existingClasses.map((c) => new Date(c.startTime).getTime()));

  const toCreate: Prisma.LmsScheduledClassCreateManyInput[] = [];
  const currentDate = new Date(fromDate);

  while (currentDate <= toDate) {
    const dayOfWeek = currentDate.getDay();
    for (const slot of batch.schedule) {
      if (slot.dayOfWeek === dayOfWeek) {
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const [endH, endM] = slot.endTime.split(':').map(Number);
        const startTime = new Date(currentDate);
        startTime.setHours(startH, startM, 0, 0);
        const endTime = new Date(currentDate);
        endTime.setHours(endH, endM, 0, 0);

        if (!existingSet.has(startTime.getTime())) {
          existingSet.add(startTime.getTime());
          toCreate.push({
            orgId,
            batchId: batch.id,
            teacherId: batch.teacherId,
            title: `${batch.subject} - ${batch.name}`,
            startTime,
            endTime,
            location: slot.location ?? null,
            status: 'scheduled',
            isRecurring: true,
            recurringPattern: { frequency: 'weekly', endDate: toDate.toISOString() },
          });
        }
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (toCreate.length === 0) return [];

  // Insert one-by-one to skip the @@unique([batchId, startTime]) race duplicates
  const inserted: unknown[] = [];
  for (const data of toCreate) {
    try {
      inserted.push(await prisma.lmsScheduledClass.create({ data }));
    } catch {
      /* duplicate guard — skip */
    }
  }
  return inserted;
}

// ═══════════════ GET SESSION JOIN TIMESTAMPS (ADMIN) ═══════════════
export async function getSessionJoinTimestamps(
  orgId: string,
  params: { startDate?: string; endDate?: string; batchId?: string; teacherId?: string; limit?: number },
) {
  const now = new Date();
  const start = params.startDate ? new Date(params.startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = params.endDate ? new Date(params.endDate) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(Number(params.limit || 200), 1), 1000);

  const where: Prisma.LmsScheduledClassWhereInput = {
    orgId,
    startTime: { gte: start, lte: end },
    status: { not: 'rescheduled' },
  };
  if (params.batchId) where.batchId = params.batchId;
  if (params.teacherId) where.teacherId = params.teacherId;

  const classes = await prisma.lmsScheduledClass.findMany({
    where,
    orderBy: { startTime: 'desc' },
    take: limit,
  });

  const batchMap = await loadBatchLite(classes.map((c) => c.batchId));
  const teacherMap = await userMap(classes.map((c) => c.teacherId));

  const meetingIds = classes.map((c) => c.meetingId).filter(Boolean) as string[];
  const meetingAttendanceByMeeting = new Map<string, Array<{ userId: string; role: string; firstJoinAt: Date }>>();
  if (meetingIds.length) {
    const rows = await prisma.lmsMeetingAttendance.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, userId: true, role: true, joinedAt: true },
    });
    for (const row of rows) {
      const list = meetingAttendanceByMeeting.get(row.meetingId) || [];
      const existing = list.find((r) => r.userId === row.userId && r.role === row.role);
      if (existing) {
        if (row.joinedAt < existing.firstJoinAt) existing.firstJoinAt = row.joinedAt;
      } else {
        list.push({ userId: row.userId, role: row.role, firstJoinAt: row.joinedAt });
      }
      meetingAttendanceByMeeting.set(row.meetingId, list);
    }
  }

  const studentIdSet = new Set<string>();
  for (const cls of classes) {
    const batch = batchMap.get(cls.batchId);
    const sids = (batch?.studentIds as string[]) || [];
    for (const sid of sids) studentIdSet.add(sid);
  }
  const studentById = await userMap(Array.from(studentIdSet));

  return classes.map((cls) => {
    const meetingId = cls.meetingId ?? null;
    const attendanceRows = meetingId ? meetingAttendanceByMeeting.get(meetingId) || [] : [];
    const teacherFirstJoinAt =
      attendanceRows
        .filter((r) => r.userId === cls.teacherId)
        .map((r) => r.firstJoinAt)
        .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const batch = batchMap.get(cls.batchId) || null;
    const batchStudentIds: string[] = (batch?.studentIds as string[]) || [];
    const teacher = teacherMap.get(cls.teacherId);

    const studentFirstJoinMap = new Map<string, Date>();
    for (const r of attendanceRows) {
      if (r.role !== 'student') continue;
      const prev = studentFirstJoinMap.get(r.userId);
      if (!prev || r.firstJoinAt.getTime() < prev.getTime()) studentFirstJoinMap.set(r.userId, r.firstJoinAt);
    }

    return {
      scheduledClassId: cls.id,
      meetingId,
      title: cls.title,
      startTime: cls.startTime,
      endTime: cls.endTime,
      status: cls.status,
      batch: batch ? { _id: batch._id, name: batch.name, subject: batch.subject, grade: batch.grade } : null,
      teacher: teacher
        ? { _id: cls.teacherId, firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email }
        : null,
      teacherFirstJoinAt,
      students: batchStudentIds.map((sid) => {
        const s = studentById.get(sid);
        return {
          _id: sid,
          firstName: s?.firstName,
          lastName: s?.lastName,
          email: s?.email,
          firstJoinAt: studentFirstJoinMap.get(sid) || null,
        };
      }),
    };
  });
}

// ═══════════════ GET ALL TENANT CLASSES (ADMIN) ═══════════════
export async function getAllTenantClasses(orgId: string, startDate?: string, endDate?: string) {
  const where: Prisma.LmsScheduledClassWhereInput = { orgId };
  applyDateRange(where, startDate, endDate);

  const classes = await prisma.lmsScheduledClass.findMany({ where, orderBy: { startTime: 'asc' } });
  return hydrateClasses(classes, true);
}

// ═══════════════ GET TEACHER'S CLASSES ═══════════════
export async function getTeacherClasses(orgId: string, teacherId: string, startDate?: string, endDate?: string) {
  const where: Prisma.LmsScheduledClassWhereInput = {
    orgId,
    status: { notIn: ['rescheduled', 'cancelled'] },
    OR: [{ teacherId }, { substituteTeacherId: teacherId }],
  };
  applyDateRange(where, startDate, endDate);

  const classes = await prisma.lmsScheduledClass.findMany({ where, orderBy: { startTime: 'asc' } });
  const seen = new Set<string>();
  const deduped = classes.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return hydrateClasses(deduped, true);
}

// ═══════════════ GET STUDENT'S CLASSES ═══════════════
export async function getStudentClasses(orgId: string, studentId: string, startDate?: string, endDate?: string) {
  const batchRows = await prisma.lmsBatchStudent.findMany({
    where: { studentId, batch: { orgId, status: ACTIVE } },
    select: { batchId: true },
  });
  const batchIds = batchRows.map((b) => b.batchId);
  if (batchIds.length === 0) return [];

  const where: Prisma.LmsScheduledClassWhereInput = {
    orgId,
    batchId: { in: batchIds },
    status: { notIn: ['cancelled', 'rescheduled'] },
  };
  applyDateRange(where, startDate, endDate);

  const classes = await prisma.lmsScheduledClass.findMany({ where, orderBy: { startTime: 'asc' } });
  return hydrateClasses(classes, false);
}

// ═══════════════ GET CLASS BY ID ═══════════════
export async function findOne(orgId: string, classId: string) {
  const cls = await prisma.lmsScheduledClass.findUnique({ where: { id: classId } });
  if (!cls || cls.orgId !== orgId) throw NotFound('Scheduled class not found');
  const [shaped] = await hydrateClasses([cls], true);
  return shaped;
}

// ═══════════════ START CLASS ═══════════════
export async function startClass(orgId: string, classId: string) {
  const cls = await prisma.lmsScheduledClass.findUnique({ where: { id: classId } });
  if (!cls || cls.orgId !== orgId) throw NotFound('Scheduled class not found');
  if (cls.status !== 'scheduled') throw BadRequest('Class can only be started from scheduled status');

  const updated = await prisma.lmsScheduledClass.update({ where: { id: classId }, data: { status: 'in_progress' } });

  // Punctuality scoring (preserved); join-link emails + escalation resolution → worker.
  try {
    const classStart = new Date(updated.startTime);
    const delayMinutes = (Date.now() - classStart.getTime()) / 60000;
    const punctualityDelta = delayMinutes <= 2 ? 1 : delayMinutes <= 5 ? 0 : -1;
    await prisma.lmsUser.update({
      where: { id: updated.teacherId },
      data: { punctualityScore: { increment: punctualityDelta } },
    });
  } catch {
    /* non-blocking */
  }

  const [shaped] = await hydrateClasses([updated], false);
  return shaped;
}

// ═══════════════ COMPLETE CLASS ═══════════════
export async function completeClass(orgId: string, classId: string) {
  const cls = await prisma.lmsScheduledClass.findUnique({ where: { id: classId } });
  if (!cls || cls.orgId !== orgId) throw NotFound('Scheduled class not found');
  if (cls.status !== 'in_progress' && cls.status !== 'scheduled') {
    throw BadRequest('Class can only be completed from in_progress or scheduled status');
  }
  const updated = await prisma.lmsScheduledClass.update({ where: { id: classId }, data: { status: 'completed' } });
  try {
    await prisma.lmsUser.update({ where: { id: updated.teacherId }, data: { classesCompleted: { increment: 1 } } });
  } catch {
    /* non-blocking */
  }
  const [shaped] = await hydrateClasses([updated], false);
  return shaped;
}

// ═══════════════ CANCEL CLASS ═══════════════
export async function cancelClass(orgId: string, classId: string, dto: { reason: string }) {
  const cls = await prisma.lmsScheduledClass.findUnique({ where: { id: classId } });
  if (!cls || cls.orgId !== orgId) throw NotFound('Scheduled class not found');
  if (cls.status === 'completed') throw BadRequest('Cannot cancel a completed class');

  const updated = await prisma.lmsScheduledClass.update({
    where: { id: classId },
    data: { status: 'cancelled', cancellationReason: dto.reason },
  });
  try {
    await prisma.lmsUser.update({ where: { id: cls.teacherId }, data: { classesCancelled: { increment: 1 } } });
  } catch {
    /* non-blocking */
  }
  return updated;
}

// ═══════════════ RESCHEDULE CLASS ═══════════════
export async function rescheduleClass(
  orgId: string,
  classId: string,
  dto: { newStartTime: string; newEndTime: string; reason: string; newLocation?: string },
) {
  const cls = await prisma.lmsScheduledClass.findUnique({ where: { id: classId } });
  if (!cls || cls.orgId !== orgId) throw NotFound('Scheduled class not found');
  if (cls.status === 'cancelled' || cls.status === 'rescheduled') {
    throw BadRequest('Cannot reschedule a cancelled or already-rescheduled class');
  }

  const newClass = await prisma.lmsScheduledClass.create({
    data: {
      orgId,
      batchId: cls.batchId,
      teacherId: cls.teacherId,
      title: cls.title,
      startTime: new Date(dto.newStartTime),
      endTime: new Date(dto.newEndTime),
      location: dto.newLocation || cls.location,
      status: 'scheduled',
      rescheduledFrom: cls.id,
      rescheduleReason: dto.reason,
    },
  });

  await prisma.lmsScheduledClass.update({
    where: { id: classId },
    data: { status: 'rescheduled', rescheduledTo: newClass.id, rescheduleReason: dto.reason },
  });

  // Reminder rescheduling + student notification → worker (Phase 4).
  return newClass;
}

// ═══════════════ MARK ATTENDANCE TIMESTAMP ═══════════════
export async function markAttendanceTimestamp(classId: string): Promise<void> {
  await prisma.lmsScheduledClass.update({
    where: { id: classId },
    data: { attendanceMarkedAt: new Date(), status: 'completed' },
  });
}

// ═══════════════ CANCEL FUTURE CLASSES FOR BATCH ═══════════════
export async function cancelFutureClassesForBatch(orgId: string, batchId: string, fromDate: Date): Promise<void> {
  await prisma.lmsScheduledClass.updateMany({
    where: { orgId, batchId, status: 'scheduled', startTime: { gte: fromDate } },
    data: { status: 'cancelled', cancellationReason: 'Batch schedule updated' },
  });
}

// ═══════════════ VALIDATE TEACHER SCHEDULE ═══════════════
export async function validateTeacherSchedule(
  teacherId: string,
  schedule: ScheduleSlot[],
  excludeBatchId?: string,
): Promise<{ available: boolean; reason?: string }[]> {
  const teacher = await prisma.lmsUser.findUnique({
    where: { id: teacherId },
    select: { orgId: true, availableSlots: { select: { dayOfWeek: true, startTime: true, endTime: true } } },
  });
  if (!teacher) return schedule.map(() => ({ available: false, reason: 'Teacher not found' }));

  const slots = teacher.availableSlots || [];
  if (slots.length === 0) {
    return schedule.map(() => ({
      available: false,
      reason:
        "Teacher has no availability slots defined. Please set the teacher's weekly availability before assigning to a batch.",
    }));
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let existingSchedules: { dayOfWeek: number; start: number; end: number; batchName: string }[] = [];
  if (teacher.orgId) {
    const batchWhere: Prisma.LmsBatchWhereInput = {
      orgId: teacher.orgId,
      teacherId,
      status: { in: ['active', 'draft'] },
    };
    if (excludeBatchId) batchWhere.id = { not: excludeBatchId };
    const existingBatches = await prisma.lmsBatch.findMany({
      where: batchWhere,
      select: { name: true, schedule: { select: { dayOfWeek: true, startTime: true, endTime: true } } },
    });
    existingSchedules = existingBatches.flatMap((b) =>
      b.schedule.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        start: timeToMinutes(s.startTime),
        end: timeToMinutes(s.endTime),
        batchName: b.name,
      })),
    );
  }

  const parsed = schedule.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    start: timeToMinutes(s.startTime),
    end: timeToMinutes(s.endTime),
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  return parsed.map((req, idx) => {
    const slotsForDay = slots.filter((s) => s.dayOfWeek === req.dayOfWeek);
    if (slotsForDay.length === 0) {
      return {
        available: false,
        reason: `Teacher has no availability on ${dayNames[req.dayOfWeek]}. Defined availability: ${slots
          .map((s) => `${dayNames[s.dayOfWeek]} ${s.startTime}-${s.endTime}`)
          .join(', ')}`,
      };
    }

    const fullyContained = slotsForDay.find(
      (s) => timeToMinutes(s.startTime) <= req.start && timeToMinutes(s.endTime) >= req.end,
    );
    if (!fullyContained) {
      const availWindows = slotsForDay.map((s) => `${s.startTime}-${s.endTime}`).join(', ');
      return {
        available: false,
        reason: `Requested slot ${req.startTime}-${req.endTime} overflows teacher's availability on ${dayNames[req.dayOfWeek]}. Available window(s): ${availWindows}. The entire class must fit within an available slot.`,
      };
    }

    for (const existing of existingSchedules) {
      if (existing.dayOfWeek !== req.dayOfWeek) continue;
      if (req.start < existing.end && req.end > existing.start) {
        return {
          available: false,
          reason: `Teacher already assigned during this time. Conflict with batch "${existing.batchName}" on ${dayNames[req.dayOfWeek]} ${minutesToTime(existing.start)}-${minutesToTime(existing.end)}. Your requested slot: ${req.startTime}-${req.endTime}.`,
        };
      }
    }

    for (let j = 0; j < parsed.length; j++) {
      if (j === idx) continue;
      const other = parsed[j];
      if (other.dayOfWeek !== req.dayOfWeek) continue;
      if (req.start < other.end && req.end > other.start) {
        return {
          available: false,
          reason: `Overlapping slots within the same batch on ${dayNames[req.dayOfWeek]}: ${req.startTime}-${req.endTime} conflicts with ${other.startTime}-${other.endTime}.`,
        };
      }
    }

    return { available: true };
  });
}

// ───────────── helpers ─────────────
function applyDateRange(where: Prisma.LmsScheduledClassWhereInput, startDate?: string, endDate?: string) {
  if (startDate || endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (startDate) range.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.startTime = range;
  }
}

async function hydrateClasses(
  classes: Array<Record<string, unknown> & { batchId: string; teacherId: string; substituteTeacherId?: string | null }>,
  withSubstitute: boolean,
) {
  const batchMap = await loadBatchLite(classes.map((c) => c.batchId));
  const teacherIds = classes.flatMap((c) =>
    withSubstitute ? [c.teacherId, c.substituteTeacherId || ''] : [c.teacherId],
  );
  const teacherMap = await userMap(teacherIds);
  return classes.map((c) => {
    const batch = batchMap.get(c.batchId) || null;
    const teacher = teacherMap.get(c.teacherId) || null;
    const sub = withSubstitute && c.substituteTeacherId ? teacherMap.get(c.substituteTeacherId) || null : undefined;
    return shapeClass(c, batch, teacher, sub);
  });
}
