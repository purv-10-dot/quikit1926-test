/**
 * Batches service — ported from NestJS BatchesService (Mongoose → Prisma).
 * Tenant scoping is applied with the explicit orgId arguments threaded through
 * every query (callers obtain it from the authed user / SUPER_ADMIN bypass via
 * tenantWhere). Mongo subdoc arrays (schedule/studentIds/substituteTeacherIds)
 * map to the BatchSchedule / BatchStudent / BatchSubstituteTeacher child tables.
 */
import type { Prisma, BatchStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, Conflict, NotFound } from '@/lib/http';
import {
  validateTeacherSchedule,
  generateClasses,
  cancelFutureClassesForBatch,
} from './scheduling-service';

type ScheduleItem = { dayOfWeek: number; startTime: string; endTime: string; location?: string };

export interface CreateBatchInput {
  name: string;
  grade?: string;
  section?: string;
  subject: string;
  description?: string;
  teacherId: string;
  substituteTeacherIds?: string[];
  academicYear: string;
  term?: string;
  startDate: string;
  endDate: string;
  schedule: ScheduleItem[];
  studentIds?: string[];
  maxCapacity?: number;
  defaultMeetingProvider?: string;
  classType?: string;
  trialClassCount?: number;
  creditPerClass?: number;
  ratePerClass?: number;
  ratePerHour?: number;
  status?: BatchStatus;
  batchType?: string;
  source?: string;
  tutoringRequestId?: string;
}

export type UpdateBatchInput = Partial<CreateBatchInput>;

const USER_NAME = { id: true, firstName: true, lastName: true, email: true } as const;

function validateAcademicYear(academicYear: string): void {
  const match = academicYear.match(/^(\d{4})-(\d{4})$/);
  if (!match) throw BadRequest('Academic year must be in format YYYY-YYYY (e.g., 2025-2026)');
  if (parseInt(match[2]) !== parseInt(match[1]) + 1) {
    throw BadRequest('Academic year must be consecutive years (e.g., 2025-2026)');
  }
}

/** Verify every supplied user ID belongs to the actor's tenant (optionally with a role). */
async function assertUsersInTenant(
  orgId: string,
  ids: string[],
  opts: { role?: 'LEARNER' | 'TEACHER'; label: string },
): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await prisma.user.count({
    where: { id: { in: unique }, orgId, ...(opts.role ? { role: opts.role } : {}) },
  });
  if (found !== unique.length) throw BadRequest(`One or more ${opts.label} are invalid for this tenant`);
}

/** Shape a batch row + child tables into the legacy populated response. */
async function shapeBatch(batchId: string, opts: { fullTeacher?: boolean; fullStudents?: boolean; subs?: boolean } = {}) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      schedule: true,
      students: { select: { studentId: true } },
      substituteTeachers: { select: { teacherId: true } },
    },
  });
  if (!batch) return null;
  return enrichBatch(batch, opts);
}

async function enrichBatch(
  batch: Prisma.BatchGetPayload<{
    include: { schedule: true; students: { select: { studentId: true } }; substituteTeachers: { select: { teacherId: true } } };
  }>,
  opts: { fullTeacher?: boolean; fullStudents?: boolean; subs?: boolean } = {},
) {
  const studentIds = batch.students.map((s) => s.studentId);
  const substituteTeacherIds = batch.substituteTeachers.map((t) => t.teacherId);

  const teacherSelect: Prisma.UserSelect = opts.fullTeacher
    ? { ...USER_NAME, subjects: true, ratePerClass: true }
    : USER_NAME;
  const studentSelect: Prisma.UserSelect = opts.fullStudents
    ? { ...USER_NAME, grade: true, section: true, studentId: true }
    : { ...USER_NAME, grade: true };

  const teacher = await prisma.user.findUnique({ where: { id: batch.teacherId }, select: teacherSelect });
  const students = studentIds.length
    ? await prisma.user.findMany({ where: { id: { in: studentIds } }, select: studentSelect })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const out: Record<string, unknown> = {
    ...batch,
    teacherId: teacher ?? batch.teacherId,
    studentIds: studentIds.map((id) => studentMap.get(id)).filter(Boolean),
  };
  delete (out as Record<string, unknown>).students;
  delete (out as Record<string, unknown>).substituteTeachers;

  if (opts.subs) {
    const subs = substituteTeacherIds.length
      ? await prisma.user.findMany({ where: { id: { in: substituteTeacherIds } }, select: USER_NAME })
      : [];
    out.substituteTeacherIds = subs;
  } else {
    out.substituteTeacherIds = substituteTeacherIds;
  }
  return out;
}

// ═══════════════ CREATE BATCH ═══════════════
export async function create(orgId: string, dto: CreateBatchInput, userId?: string) {
  const teacher = await prisma.user.findFirst({
    where: { id: dto.teacherId, orgId, role: 'TEACHER', isActive: true },
  });
  if (!teacher) throw BadRequest('Invalid teacher ID or teacher not found');

  validateAcademicYear(dto.academicYear);

  const existing = await prisma.batch.findFirst({
    where: { orgId, name: dto.name, academicYear: dto.academicYear },
  });
  if (existing) {
    throw Conflict(`A batch with name "${dto.name}" already exists for academic year ${dto.academicYear}`);
  }

  if (dto.schedule?.length) {
    const results = await validateTeacherSchedule(dto.teacherId, dto.schedule);
    const failed = results.find((r) => !r.available);
    if (failed) throw BadRequest(failed.reason || 'Schedule conflict');
  }

  const startDate = new Date(dto.startDate);
  const endDate = new Date(dto.endDate);
  if (startDate > endDate) throw BadRequest('End date must be after start date');

  // Validate client-supplied member IDs belong to this tenant before writing them.
  if (dto.studentIds?.length) await assertUsersInTenant(orgId, dto.studentIds, { role: 'LEARNER', label: 'student IDs' });
  if (dto.substituteTeacherIds?.length) await assertUsersInTenant(orgId, dto.substituteTeacherIds, { role: 'TEACHER', label: 'substitute teacher IDs' });

  const status = (dto.status as BatchStatus) ?? 'active';

  const created = await prisma.batch.create({
    data: {
      orgId,
      name: dto.name,
      grade: dto.grade,
      section: dto.section,
      subject: dto.subject,
      description: dto.description,
      teacherId: dto.teacherId,
      academicYear: dto.academicYear,
      term: dto.term,
      startDate,
      endDate,
      maxCapacity: dto.maxCapacity,
      defaultMeetingProvider: dto.defaultMeetingProvider as Prisma.BatchCreateInput['defaultMeetingProvider'],
      classType: dto.classType as Prisma.BatchCreateInput['classType'],
      trialClassCount: dto.trialClassCount,
      creditPerClass: dto.creditPerClass,
      ratePerClass: dto.ratePerClass,
      ratePerHour: dto.ratePerHour,
      status,
      batchType: dto.batchType as Prisma.BatchCreateInput['batchType'],
      source: dto.source as Prisma.BatchCreateInput['source'],
      tutoringRequestId: dto.tutoringRequestId,
      createdBy: userId,
      schedule: dto.schedule?.length
        ? {
            create: dto.schedule.map((s) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              location: s.location,
            })),
          }
        : undefined,
      students: dto.studentIds?.length
        ? { create: dto.studentIds.map((studentId) => ({ studentId })) }
        : undefined,
      substituteTeachers: dto.substituteTeacherIds?.length
        ? { create: dto.substituteTeacherIds.map((teacherId) => ({ teacherId })) }
        : undefined,
    },
  });

  // Auto-generate classes for active batches (was fire-and-forget in legacy; awaited
  // here so the serverless function does not terminate before they persist).
  if (created.status === 'active') {
    try {
      await generateClasses(orgId, { batchId: created.id });
    } catch {
      /* non-blocking */
    }
  }

  return shapeBatch(created.id);
}

// ═══════════════ FIND ALL BATCHES ═══════════════
export async function findAll(
  orgId: string,
  options?: { status?: BatchStatus; teacherId?: string; academicYear?: string; grade?: string; subject?: string },
) {
  const where: Prisma.BatchWhereInput = { orgId };
  if (options?.status) where.status = options.status;
  if (options?.teacherId) where.teacherId = options.teacherId;
  if (options?.academicYear) where.academicYear = options.academicYear;
  if (options?.grade) where.grade = options.grade;
  if (options?.subject) where.subject = options.subject;

  const batches = await prisma.batch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      schedule: true,
      students: { select: { studentId: true } },
      substituteTeachers: { select: { teacherId: true } },
    },
  });
  return Promise.all(batches.map((b) => enrichBatch(b)));
}

// ═══════════════ FIND ONE BATCH ═══════════════
export async function findOne(orgId: string, batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');
  return shapeBatch(batchId, { fullTeacher: true, fullStudents: true, subs: true });
}

// ═══════════════ FIND BATCHES BY TEACHER ═══════════════
export async function findByTeacher(orgId: string, teacherId: string) {
  const batches = await prisma.batch.findMany({
    where: {
      orgId,
      status: 'active',
      OR: [{ teacherId }, { substituteTeachers: { some: { teacherId } } }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      schedule: true,
      students: { select: { studentId: true } },
      substituteTeachers: { select: { teacherId: true } },
    },
  });

  const allStudentIds = Array.from(new Set(batches.flatMap((b) => b.students.map((s) => s.studentId))));
  const students = allStudentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: allStudentIds } },
        select: { id: true, firstName: true, lastName: true, email: true, grade: true, section: true, studentId: true, phone: true, role: true },
      })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s]));

  return batches.map((batch) => {
    const { students: _students, substituteTeachers, ...rest } = batch;
    return {
      ...rest,
      substituteTeacherIds: substituteTeachers.map((t) => t.teacherId),
      studentIds: _students.map((s) => studentMap.get(s.studentId)).filter(Boolean),
    };
  });
}

// ═══════════════ FIND BATCHES BY STUDENT ═══════════════
export async function findByStudent(orgId: string, studentId: string) {
  const batches = await prisma.batch.findMany({
    where: { orgId, status: 'active', students: { some: { studentId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      schedule: true,
      students: { select: { studentId: true } },
      substituteTeachers: { select: { teacherId: true } },
    },
  });
  return Promise.all(batches.map((b) => enrichBatch(b)));
}

// ═══════════════ UPDATE BATCH ═══════════════
export async function update(orgId: string, batchId: string, dto: UpdateBatchInput) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');

  if (dto.teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: dto.teacherId, orgId, role: 'TEACHER', isActive: true },
    });
    if (!teacher) throw BadRequest('Invalid teacher ID or teacher not found');
  }

  if (dto.schedule?.length) {
    const teacherIdForValidation = dto.teacherId || batch.teacherId;
    if (teacherIdForValidation) {
      const results = await validateTeacherSchedule(teacherIdForValidation, dto.schedule, batchId);
      const failed = results.find((r) => !r.available);
      if (failed) throw BadRequest(failed.reason || 'Schedule conflict');
    }
  }

  if (dto.name) {
    const academicYear = dto.academicYear || batch.academicYear;
    const dup = await prisma.batch.findFirst({
      where: { id: { not: batchId }, orgId, name: dto.name, academicYear },
    });
    if (dup) throw Conflict(`A batch with name "${dto.name}" already exists for academic year ${academicYear}`);
  }

  if (dto.startDate && dto.endDate) {
    if (new Date(dto.startDate) >= new Date(dto.endDate)) throw BadRequest('End date must be after start date');
  }

  // Validate client-supplied member IDs belong to this tenant before writing them.
  if (dto.studentIds?.length) await assertUsersInTenant(orgId, dto.studentIds, { role: 'LEARNER', label: 'student IDs' });
  if (dto.substituteTeacherIds?.length) await assertUsersInTenant(orgId, dto.substituteTeacherIds, { role: 'TEACHER', label: 'substitute teacher IDs' });

  const data: Prisma.BatchUpdateInput = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.grade !== undefined) data.grade = dto.grade;
  if (dto.section !== undefined) data.section = dto.section;
  if (dto.subject !== undefined) data.subject = dto.subject;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.teacherId !== undefined) data.teacherId = dto.teacherId;
  if (dto.academicYear !== undefined) data.academicYear = dto.academicYear;
  if (dto.term !== undefined) data.term = dto.term;
  if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
  if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
  if (dto.maxCapacity !== undefined) data.maxCapacity = dto.maxCapacity;
  if (dto.defaultMeetingProvider !== undefined)
    data.defaultMeetingProvider = dto.defaultMeetingProvider as Prisma.BatchUpdateInput['defaultMeetingProvider'];
  if (dto.classType !== undefined) data.classType = dto.classType as Prisma.BatchUpdateInput['classType'];
  if (dto.trialClassCount !== undefined) data.trialClassCount = dto.trialClassCount;
  if (dto.creditPerClass !== undefined) data.creditPerClass = dto.creditPerClass;
  if (dto.ratePerClass !== undefined) data.ratePerClass = dto.ratePerClass;
  if (dto.ratePerHour !== undefined) data.ratePerHour = dto.ratePerHour;
  if (dto.status !== undefined) data.status = dto.status as BatchStatus;

  if (dto.substituteTeacherIds !== undefined) {
    data.substituteTeachers = {
      deleteMany: {},
      create: dto.substituteTeacherIds.map((teacherId) => ({ teacherId })),
    };
  }
  if (dto.studentIds !== undefined) {
    data.students = { deleteMany: {}, create: dto.studentIds.map((studentId) => ({ studentId })) };
  }
  if (dto.schedule !== undefined) {
    data.schedule = {
      deleteMany: {},
      create: dto.schedule.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
      })),
    };
  }

  const updated = await prisma.batch.update({ where: { id: batchId }, data });

  const datesOrScheduleChanged =
    dto.startDate !== undefined || dto.endDate !== undefined || dto.schedule !== undefined;
  if (datesOrScheduleChanged && updated.status === 'active') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await cancelFutureClassesForBatch(orgId, batchId, today);
    try {
      await generateClasses(orgId, { batchId });
    } catch {
      /* non-blocking */
    }
  }

  return shapeBatch(batchId);
}

// ═══════════════ ADD STUDENTS TO BATCH ═══════════════
export async function addStudents(orgId: string, batchId: string, dto: { studentIds: string[] }) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { students: { select: { studentId: true } } },
  });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');

  if (batch.maxCapacity) {
    const currentCount = batch.students.length;
    const newCount = dto.studentIds.length;
    if (currentCount + newCount > batch.maxCapacity) {
      throw BadRequest(
        `Cannot add ${newCount} students. Batch capacity is ${batch.maxCapacity}, currently has ${currentCount} students.`,
      );
    }
  }

  const students = await prisma.user.findMany({
    where: { id: { in: dto.studentIds }, orgId, role: 'LEARNER', isActive: true },
    select: { id: true },
  });
  if (students.length !== dto.studentIds.length) throw BadRequest('One or more student IDs are invalid');

  await prisma.batchStudent.createMany({
    data: dto.studentIds.map((studentId) => ({ batchId, studentId })),
    skipDuplicates: true,
  });

  return shapeBatch(batchId);
}

// ═══════════════ REMOVE STUDENT FROM BATCH ═══════════════
export async function removeStudent(orgId: string, batchId: string, studentId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');
  await prisma.batchStudent.deleteMany({ where: { batchId, studentId } });
  return shapeBatch(batchId);
}

// ═══════════════ ARCHIVE BATCH ═══════════════
export async function archive(orgId: string, batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');
  return prisma.batch.update({ where: { id: batchId }, data: { status: 'archived' } });
}

// ═══════════════ DELETE BATCH (draft/archived only) ═══════════════
export async function remove(orgId: string, batchId: string): Promise<void> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.orgId !== orgId) throw NotFound('Batch not found');
  if (batch.status === 'active') {
    throw BadRequest(
      'Active batches cannot be deleted directly. Please archive the batch first, then delete it.',
    );
  }
  await prisma.batch.delete({ where: { id: batchId } });
}

// ═══════════════ GET BATCH STATISTICS ═══════════════
export async function getStatistics(orgId: string) {
  const batches = await prisma.batch.findMany({
    where: { orgId },
    select: { status: true, _count: { select: { students: true } } },
  });

  const result = { active: 0, draft: 0, archived: 0, totalStudents: 0 };
  for (const b of batches) {
    result[b.status as keyof typeof result]++;
    result.totalStudents += b._count.students;
  }
  return result;
}
