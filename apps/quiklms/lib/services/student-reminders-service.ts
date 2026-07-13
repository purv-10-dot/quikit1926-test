/**
 * Student-reminder service — ported from NestJS StudentReminderService
 * (Mongoose → Prisma). Only the read endpoints are exposed here; the cron-driven
 * detection and Twilio reminder-call dispatch live in the worker (Phase 4).
 * Mongo populate() of student / scheduledClass reproduced with manual lookups.
 */
import type { Prisma, ReminderCallStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

async function studentMap(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  return new Map(users.map((u) => [u.id, { _id: u.id, ...u }]));
}

async function classMap(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const classes = await prisma.scheduledClass.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true, startTime: true },
  });
  return new Map(classes.map((c) => [c.id, { _id: c.id, ...c }]));
}

function shapeRows(
  rows: (Prisma.StudentReminderCallGetPayload<{ include: { callAttempts: true } }>)[],
  smap: Map<string, Record<string, unknown>>,
  cmap: Map<string, Record<string, unknown>>,
) {
  return rows.map((r) => ({
    _id: r.id,
    ...r,
    callAttempts: r.callAttempts.map((a) => ({ _id: a.id, ...a })),
    studentId: smap.get(r.studentId) ?? r.studentId,
    scheduledClassId: cmap.get(r.scheduledClassId) ?? r.scheduledClassId,
  }));
}

export async function getRemindersForAdmin(orgId: string, query: { status?: string; from?: string; to?: string }) {
  const where: Prisma.StudentReminderCallWhereInput = { orgId };
  if (query.status) where.status = query.status as ReminderCallStatus;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const rows = await prisma.studentReminderCall.findMany({
    where,
    include: { callAttempts: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const smap = await studentMap(rows.map((r) => r.studentId));
  const cmap = await classMap(rows.map((r) => r.scheduledClassId));
  return shapeRows(rows, smap, cmap);
}

export async function getRemindersForTeacher(orgId: string, teacherId: string) {
  const teacherClasses = await prisma.scheduledClass.findMany({
    where: { orgId, teacherId },
    select: { id: true },
  });
  const classIds = teacherClasses.map((c) => c.id);

  const rows = await prisma.studentReminderCall.findMany({
    where: { orgId, scheduledClassId: { in: classIds } },
    include: { callAttempts: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const smap = await studentMap(rows.map((r) => r.studentId));
  const cmap = await classMap(rows.map((r) => r.scheduledClassId));
  return shapeRows(rows, smap, cmap);
}
