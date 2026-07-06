/**
 * Escalations service — ported from NestJS EscalationService (Mongoose → Prisma).
 * Only the read endpoints are exposed here; the cron-driven missed-class detection,
 * absence-call dispatch and Twilio calling live in the worker (Phase 4). These
 * functions own the read side, reproducing Mongo populate() with manual lookups.
 */
import type { Prisma, EscalationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

async function classMap(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const classes = await prisma.scheduledClass.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });
  return new Map(classes.map((c) => [c.id, { _id: c.id, ...c }]));
}

async function userMap(ids: string[], select: Prisma.UserSelect) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select });
  return new Map(users.map((u) => [u.id, { _id: u.id, ...(u as Record<string, unknown>) }]));
}

export async function getTeacherEscalations(tenantId: string, teacherId: string) {
  const rows = await prisma.callEscalation.findMany({
    where: { tenantId, teacherId },
    include: { callAttempts: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const cmap = await classMap(rows.map((r) => r.scheduledClassId));
  return rows.map((r) => ({
    _id: r.id,
    ...r,
    callAttempts: r.callAttempts.map((a) => ({ _id: a.id, ...a })),
    scheduledClassId: cmap.get(r.scheduledClassId) ?? r.scheduledClassId,
  }));
}

export async function getAdminEscalations(tenantId: string, filters?: { status?: string; from?: Date; to?: Date }) {
  const where: Prisma.CallEscalationWhereInput = { tenantId };
  if (filters?.status) where.status = filters.status as EscalationStatus;
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters?.from) where.createdAt.gte = filters.from;
    if (filters?.to) where.createdAt.lte = filters.to;
  }

  const rows = await prisma.callEscalation.findMany({
    where,
    include: { callAttempts: true },
    orderBy: { createdAt: 'desc' },
  });

  const cmap = await classMap(rows.map((r) => r.scheduledClassId));
  const tmap = await userMap(rows.map((r) => r.teacherId), {
    id: true, firstName: true, lastName: true, email: true, guardianContact: true, phone: true,
  });

  return rows.map((r) => ({
    _id: r.id,
    ...r,
    callAttempts: r.callAttempts.map((a) => ({ _id: a.id, ...a })),
    teacherId: tmap.get(r.teacherId) ?? r.teacherId,
    scheduledClassId: cmap.get(r.scheduledClassId) ?? r.scheduledClassId,
  }));
}
