/**
 * Teacher-availability service — ported from NestJS TeacherAvailabilityService
 * (Mongoose → Prisma). User.availableSlots is the userAvailabilitySlot child
 * table here. Tenant isolation via explicit tenantId args + teacher tenant check.
 */
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';

export interface FreeWindow { dayOfWeek: number; startTime: string; endTime: string; }
export interface AssignedSlot { dayOfWeek: number; startTime: string; endTime: string; batchName: string; }

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function subtractRanges(
  baseStart: number,
  baseEnd: number,
  occupied: { start: number; end: number }[],
): { start: number; end: number }[] {
  const free: { start: number; end: number }[] = [];
  let cursor = baseStart;
  for (const occ of occupied) {
    const occStart = Math.max(occ.start, baseStart);
    const occEnd = Math.min(occ.end, baseEnd);
    if (occStart >= occEnd) continue;
    if (cursor < occStart) free.push({ start: cursor, end: occStart });
    cursor = Math.max(cursor, occEnd);
  }
  if (cursor < baseEnd) free.push({ start: cursor, end: baseEnd });
  return free;
}

export async function updateAvailableSlots(
  tenantId: string,
  teacherId: string,
  slots: { dayOfWeek: number; startTime: string; endTime: string }[],
  maxSlotsPerWeek?: number,
) {
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, tenantId, role: 'TEACHER' } });
  if (!teacher) throw NotFound('Teacher not found');

  await prisma.userAvailabilitySlot.deleteMany({ where: { userId: teacherId } });
  if (slots?.length) {
    await prisma.userAvailabilitySlot.createMany({
      data: slots.map((s) => ({ userId: teacherId, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })),
    });
  }
  if (maxSlotsPerWeek !== undefined) {
    await prisma.user.update({ where: { id: teacherId }, data: { maxSlotsPerWeek } });
  }

  return prisma.user.findUnique({ where: { id: teacherId }, include: { availableSlots: true } });
}

export async function getTeacherAvailability(tenantId: string, teacherId: string) {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId, role: 'TEACHER' },
    select: {
      id: true, firstName: true, lastName: true, email: true, maxSlotsPerWeek: true,
      classesCompleted: true, classesMissed: true, classesCancelled: true, punctualityScore: true,
      availableSlots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
    },
  });
  if (!teacher) throw NotFound('Teacher not found');

  const batches = await prisma.batch.findMany({
    where: { tenantId, teacherId, status: { in: ['active', 'draft'] } },
    select: { name: true, schedule: { select: { dayOfWeek: true, startTime: true, endTime: true } } },
  });

  const assignedSlots: AssignedSlot[] = batches.flatMap((b) =>
    (b.schedule || []).map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, batchName: b.name })),
  );

  const availableSlots = teacher.availableSlots || [];
  const availabilityConfigured = availableSlots.length > 0;

  const freeWindows: FreeWindow[] = [];
  let totalFreeMinutes = 0;
  let totalBaseMinutes = 0;
  let totalAssignedMinutes = 0;

  for (const base of availableSlots) {
    const baseStart = timeToMin(base.startTime);
    const baseEnd = timeToMin(base.endTime);
    totalBaseMinutes += baseEnd - baseStart;

    const dayAssigned = assignedSlots
      .filter((a) => a.dayOfWeek === base.dayOfWeek)
      .map((a) => ({ start: timeToMin(a.startTime), end: timeToMin(a.endTime) }))
      .sort((a, b) => a.start - b.start);

    const remaining = subtractRanges(baseStart, baseEnd, dayAssigned);
    for (const r of remaining) {
      freeWindows.push({ dayOfWeek: base.dayOfWeek, startTime: minToTime(r.start), endTime: minToTime(r.end) });
      totalFreeMinutes += r.end - r.start;
    }
  }

  for (const a of assignedSlots) {
    totalAssignedMinutes += timeToMin(a.endTime) - timeToMin(a.startTime);
  }

  const utilization = totalBaseMinutes > 0 ? Math.round((totalAssignedMinutes / totalBaseMinutes) * 100) : 0;

  return {
    teacher: {
      _id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      classesCompleted: teacher.classesCompleted || 0,
      classesMissed: teacher.classesMissed || 0,
      classesCancelled: teacher.classesCancelled || 0,
      punctualityScore: teacher.punctualityScore || 0,
    },
    totalBaseSlots: availableSlots.length,
    totalAssignedSlots: assignedSlots.length,
    totalFreeWindows: freeWindows.length,
    totalBaseMinutes,
    totalAssignedMinutes,
    totalFreeMinutes,
    utilization,
    availableSlots,
    assignedSlots,
    freeWindows,
    availabilityConfigured,
  };
}

export async function getAllTeacherAvailability(tenantId: string) {
  const teachers = await prisma.user.findMany({
    where: { tenantId, role: 'TEACHER', isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const results: unknown[] = [];
  for (const teacher of teachers) {
    try {
      results.push(await getTeacherAvailability(tenantId, teacher.id));
    } catch {
      results.push({
        teacher: { _id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName, email: teacher.email },
        totalBaseSlots: 0,
        totalAssignedSlots: 0,
        totalFreeWindows: 0,
        totalBaseMinutes: 0,
        totalAssignedMinutes: 0,
        totalFreeMinutes: 0,
        utilization: 0,
        availabilityConfigured: false,
      });
    }
  }
  return results;
}
