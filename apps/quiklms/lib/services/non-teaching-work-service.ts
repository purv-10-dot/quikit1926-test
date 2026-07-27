/**
 * Non-teaching-work service — ported from NestJS NonTeachingWorkService
 * (Mongoose → Prisma). Tenant isolation enforced via explicit orgId args.
 * Mongo populate() of teacher / assignedBy / approvedBy reproduced with manual
 * lookups (actor refs are scalar Strings), preserving the legacy nested shapes.
 */
import type { Prisma, LmsTaskStatus as TaskStatus, LmsTaskCategory as TaskCategory } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFound, BadRequest } from '@/lib/http';

const USER_NAME_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

async function userMap(ids: (string | null | undefined)[], select: Prisma.LmsUserSelect = USER_NAME_SELECT) {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await db.lmsUser.findMany({ where: { id: { in: unique } }, select });
  return new Map(users.map((u) => [u.id, u as Record<string, unknown>]));
}

function shapeUser(u: Record<string, unknown> | undefined | null) {
  return u ? { _id: u.id, ...u } : null;
}

export async function createTask(
  orgId: string,
  assignedBy: string,
  dto: { teacherId: string; title: string; description?: string; category?: string; paymentAmount: number; dueDate?: string },
) {
  const task = await db.lmsNonTeachingTask.create({
    data: {
      orgId,
      teacherId: dto.teacherId,
      assignedBy,
      title: dto.title,
      description: dto.description,
      category: (dto.category as TaskCategory) ?? undefined,
      paymentAmount: dto.paymentAmount,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    },
  });
  return { _id: task.id, ...task };
}

export async function getAdminTasks(orgId: string, filters?: { teacherId?: string; status?: string }) {
  const where: Prisma.LmsNonTeachingTaskWhereInput = { orgId };
  if (filters?.teacherId) where.teacherId = filters.teacherId;
  if (filters?.status) where.status = filters.status as TaskStatus;

  const rows = await db.lmsNonTeachingTask.findMany({ where, orderBy: { createdAt: 'desc' } });
  const teacherMap = await userMap(rows.map((r) => r.teacherId));
  const assignerMap = await userMap(rows.map((r) => r.assignedBy));
  const approverMap = await userMap(rows.map((r) => r.approvedBy));

  return rows.map((r) => ({
    _id: r.id,
    ...r,
    teacherId: shapeUser(teacherMap.get(r.teacherId)),
    assignedBy: shapeUser(assignerMap.get(r.assignedBy)),
    approvedBy: r.approvedBy ? shapeUser(approverMap.get(r.approvedBy)) : null,
  }));
}

export async function getTeacherTasks(orgId: string, teacherId: string) {
  const rows = await db.lmsNonTeachingTask.findMany({
    where: { orgId, teacherId },
    orderBy: { createdAt: 'desc' },
  });
  const assignerMap = await userMap(rows.map((r) => r.assignedBy));
  return rows.map((r) => ({ _id: r.id, ...r, assignedBy: shapeUser(assignerMap.get(r.assignedBy)) }));
}

export async function markComplete(
  orgId: string,
  taskId: string,
  teacherId: string,
  dto: { completionNotes?: string; hoursSpent?: number; attachmentUrls?: string[] },
) {
  const task = await db.lmsNonTeachingTask.findFirst({ where: { id: taskId, orgId, teacherId } });
  if (!task) throw NotFound('Task not found');
  if (task.status !== 'assigned' && task.status !== 'in_progress') {
    throw BadRequest('Task cannot be marked complete in current status');
  }

  const updated = await db.lmsNonTeachingTask.update({
    where: { id: taskId },
    data: {
      status: 'completed_pending',
      completedAt: new Date(),
      completionNotes: dto.completionNotes,
      hoursSpent: dto.hoursSpent,
      attachmentUrls: dto.attachmentUrls || [],
    },
  });
  return { _id: updated.id, ...updated };
}

export async function approveTask(orgId: string, taskId: string, adminId: string) {
  const task = await db.lmsNonTeachingTask.findFirst({
    where: { id: taskId, orgId, status: 'completed_pending' },
  });
  if (!task) throw NotFound('Task not found or not pending approval');

  const updated = await db.lmsNonTeachingTask.update({
    where: { id: taskId },
    data: { status: 'approved', approvedAt: new Date(), approvedBy: adminId },
  });
  return { _id: updated.id, ...updated };
}

export async function rejectTask(orgId: string, taskId: string, _adminId: string, reason?: string) {
  const task = await db.lmsNonTeachingTask.findFirst({
    where: { id: taskId, orgId, status: 'completed_pending' },
  });
  if (!task) throw NotFound('Task not found or not pending approval');

  const updated = await db.lmsNonTeachingTask.update({
    where: { id: taskId },
    data: { status: 'rejected', rejectionReason: reason },
  });
  return { _id: updated.id, ...updated };
}
