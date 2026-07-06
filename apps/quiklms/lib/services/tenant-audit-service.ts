/**
 * Tenant-audit service — ported from TenantAuditService (Prisma).
 * Tenant-scoped (TENANT_ADMIN / SUB_ADMIN). Logs live in TenantLog; performedBy is
 * a scalar userId that we populate to a user object to mirror the legacy response.
 *
 * TenantActionType enum members are PascalCase mapped to spaced strings — we use the
 * member names (e.g. NewLearnerInvited) in code; Prisma stores the mapped value.
 */
import type { Prisma, TenantActionType } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface TenantLogFilters {
  startDate?: Date;
  endDate?: Date;
  actionType?: TenantActionType;
  limit?: number;
  skip?: number;
}

function buildWhere(tenantId: string, filters?: TenantLogFilters): Prisma.TenantLogWhereInput {
  const where: Prisma.TenantLogWhereInput = { tenantId };
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  if (filters?.actionType) where.actionType = filters.actionType;
  return where;
}

async function populatePerformedBy<T extends { performedBy: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.performedBy).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const map = new Map(users.map((u) => [u.id, { _id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }]));
  return rows.map((r) => ({ ...r, _id: (r as unknown as { id: string }).id, performedBy: map.get(r.performedBy) ?? r.performedBy }));
}

export async function getTenantLogs(tenantId: string, filters?: TenantLogFilters) {
  const where = buildWhere(tenantId, filters);
  const total = await prisma.tenantLog.count({ where });
  const rows = await prisma.tenantLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 100,
    skip: filters?.skip || 0,
  });
  const logs = await populatePerformedBy(rows);
  return { logs, total };
}

export async function getLogsForPDF(
  tenantId: string,
  startDate?: Date,
  endDate?: Date,
  actionType?: TenantActionType,
) {
  const where = buildWhere(tenantId, { startDate, endDate, actionType });
  const rows = await prisma.tenantLog.findMany({ where, orderBy: { createdAt: 'desc' } });
  return populatePerformedBy(rows);
}

/**
 * Backfill audit logs from existing data the first time a tenant views the trail.
 * Mirrors the legacy seed: course assignments, learner invites, course completions.
 */
export async function seedIfEmpty(tenantId: string): Promise<number> {
  const count = await prisma.tenantLog.count({ where: { tenantId } });
  if (count > 0) return 0;

  let seeded = 0;

  // 1. Course assignments → CourseAssignedToUser, grouped by assignedBy + courseId
  try {
    const assignments = await prisma.courseAssignment.findMany({
      where: { tenantId },
      select: { courseId: true, assignedBy: true, assignedAt: true, createdAt: true },
    });
    const courseIds = [...new Set(assignments.map((a) => a.courseId).filter(Boolean))];
    const courses = courseIds.length
      ? await prisma.masterCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
      : [];
    const courseMap = new Map(courses.map((c) => [c.id, c.title]));

    const grouped = new Map<string, { courseId: string; courseTitle: string; assignedBy: string; count: number; assignedAt: Date }>();
    for (const a of assignments) {
      if (!a.assignedBy) continue;
      const key = `${a.assignedBy}-${a.courseId}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          courseId: a.courseId,
          courseTitle: courseMap.get(a.courseId) || 'Unknown Course',
          assignedBy: a.assignedBy,
          count: 0,
          assignedAt: a.assignedAt || a.createdAt || new Date(),
        });
      }
      grouped.get(key)!.count++;
    }

    for (const [, data] of grouped) {
      await prisma.tenantLog.create({
        data: {
          tenantId,
          actionType: 'CourseAssignedToUser',
          description: `Course "${data.courseTitle}" assigned to ${data.count} learner(s)`,
          performedBy: data.assignedBy,
          metadata: { courseId: data.courseId, count: data.count },
          createdAt: data.assignedAt,
        },
      });
      seeded++;
    }
  } catch {
    /* ignore seed errors */
  }

  // 2. Learner invites → NewLearnerInvited
  try {
    const learners = await prisma.user.findMany({
      where: { tenantId, role: 'LEARNER' },
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
    });
    if (learners.length > 0) {
      const admin = await prisma.user.findFirst({ where: { tenantId, role: 'TENANT_ADMIN' }, select: { id: true } });
      const performedBy = admin?.id || learners[0].id;
      for (const learner of learners) {
        await prisma.tenantLog.create({
          data: {
            tenantId,
            actionType: 'NewLearnerInvited',
            description: `Learner ${learner.firstName} ${learner.lastName} (${learner.email}) added to organization`,
            performedBy,
            metadata: { userId: learner.id },
            createdAt: learner.createdAt || new Date(),
          },
        });
        seeded++;
      }
    }
  } catch {
    /* ignore seed errors */
  }

  // 3. Course completions → CourseCompleted
  try {
    const completions = await prisma.progress.findMany({
      where: { tenantId, status: 'Completed' },
      select: { courseId: true, learnerId: true, completedAt: true, updatedAt: true },
    });
    const courseIds = [...new Set(completions.map((c) => c.courseId).filter(Boolean))];
    const courses = courseIds.length
      ? await prisma.masterCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
      : [];
    const courseMap = new Map(courses.map((c) => [c.id, c.title]));

    for (const progress of completions) {
      await prisma.tenantLog.create({
        data: {
          tenantId,
          actionType: 'CourseCompleted',
          description: `Learner completed course "${courseMap.get(progress.courseId) || 'Unknown Course'}"`,
          performedBy: progress.learnerId,
          metadata: { courseId: progress.courseId },
          createdAt: progress.completedAt || progress.updatedAt || new Date(),
        },
      });
      seeded++;
    }
  } catch {
    /* ignore seed errors */
  }

  return seeded;
}
