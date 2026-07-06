/**
 * Course assignments service — ported from CourseAssignmentsService (Prisma).
 *
 * courseId is scalar (refs MasterCourse or legacy Course). Group membership is
 * resolved via the groupMember join table (Group.memberIds → GroupMember).
 * S3 thumbnail presigning is SKIPPED (stored url returned). Reminder scheduling
 * (handleNewAssignment / cancelAssignmentReminders) is handled by the worker —
 * omitted here (noted).
 */
import type { AssignmentTargetType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest, Forbidden } from '@/lib/http';

const DEFAULT_DEADLINE_DAYS = 21;

export interface AssignCourseInput {
  courseId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
  dueDate?: string;
  isMandatory?: boolean;
  skipPrerequisiteCheck?: boolean;
}

async function getGroupMemberIds(tenantId: string, groupId: string): Promise<string[]> {
  const group = await prisma.group.findFirst({ where: { id: groupId, tenantId } });
  if (!group) throw NotFound(`Group ${groupId} not found`);
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

export async function checkPrerequisites(courseId: string, userId: string, tenantId: string) {
  // Resolve course + its prerequisites. MasterCourse stores no prereq relation;
  // legacy Course has CoursePrerequisite. Try Course first for prereqs.
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { prerequisites: { select: { prerequisiteId: true } } },
  });
  const masterExists = course ? null : await prisma.masterCourse.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course && !masterExists) throw NotFound('Course not found');

  const prereqIds = (course?.prerequisites || []).map((p) => p.prerequisiteId);
  if (prereqIds.length === 0) return { canAccess: true, missingCourses: [] as string[] };

  const completed = await prisma.progress.findMany({
    where: { tenantId, learnerId: userId, courseId: { in: prereqIds }, status: 'Completed' },
    select: { courseId: true },
  });
  const completedSet = new Set(completed.map((p) => p.courseId));
  const missingIds = prereqIds.filter((id) => !completedSet.has(id));
  if (missingIds.length === 0) return { canAccess: true, missingCourses: [] as string[] };

  const missingCourses: string[] = [];
  for (const id of missingIds) {
    const mc = await prisma.masterCourse.findUnique({ where: { id }, select: { title: true } });
    if (mc) { missingCourses.push(mc.title); continue; }
    const c = await prisma.course.findUnique({ where: { id }, select: { title: true } });
    if (c) missingCourses.push(c.title);
  }
  return { canAccess: false, missingCourses };
}

export async function getAssignedCourses(tenantId: string | null | undefined) {
  // MasterCourses published + assigned to this tenant (or all for super admin)
  const tenantFilter = tenantId ? { selectedTenants: { some: { tenantId } } } : {};
  const masterCourses = await prisma.masterCourse.findMany({
    where: { status: 'Published', parentCourseId: null, ...tenantFilter },
    orderBy: { createdAt: 'desc' },
  });

  let ownPending: typeof masterCourses = [];
  if (tenantId) {
    ownPending = await prisma.masterCourse.findMany({
      where: { status: { not: 'Published' }, parentCourseId: null, submittedByTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  const legacyCourses = await prisma.course.findMany({
    where: { isMaster: true, ...(tenantId ? { selectedTenants: { some: { tenantId } } } : {}) },
    orderBy: { createdAt: 'desc' },
  });

  const seen = new Set<string>();
  const mapMaster = (c: (typeof masterCourses)[number]) => {
    seen.add(c.id);
    return {
      _id: c.id, title: c.title, description: c.description, category: c.category,
      thumbnailUrl: c.thumbnailUrl, status: c.status, createdAt: c.createdAt,
      authorId: c.authorId, submittedBy: c.submittedBy, submittedByTenantId: c.submittedByTenantId, source: 'master',
    };
  };

  const all = [
    ...masterCourses.map(mapMaster),
    ...ownPending.filter((c) => !seen.has(c.id)).map(mapMaster),
    ...legacyCourses.map((c) => ({
      _id: c.id, title: c.title, description: c.description, category: c.category,
      thumbnailUrl: c.thumbnailUrl, status: c.status, createdAt: c.createdAt, authorId: c.authorId, source: 'legacy',
    })),
  ];
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const counts = await countEnrolledLearnersByCourseIds(all.map((c) => c._id), tenantId);
  return all.map((c) => ({ ...c, enrolledCount: counts[c._id] ?? 0 }));
}

export async function countEnrolledLearnersByCourseIds(courseIds: string[], tenantId: string | null | undefined) {
  const counts: Record<string, number> = {};
  if (courseIds.length === 0) return counts;
  const assignments = await prisma.courseAssignment.findMany({
    where: { courseId: { in: courseIds }, ...(tenantId ? { tenantId } : {}) },
  });
  const learnerIdsByCourse = new Map<string, Set<string>>();
  const groupIdsByCourse = new Map<string, string[]>();
  for (const a of assignments) {
    if (!learnerIdsByCourse.has(a.courseId)) learnerIdsByCourse.set(a.courseId, new Set());
    if (a.targetType === 'USER') learnerIdsByCourse.get(a.courseId)!.add(a.targetId);
    else groupIdsByCourse.set(a.courseId, [...(groupIdsByCourse.get(a.courseId) || []), a.targetId]);
  }
  if (groupIdsByCourse.size > 0) {
    const allGroupIds = [...new Set([...groupIdsByCourse.values()].flat())].filter(Boolean);
    const members = await prisma.groupMember.findMany({ where: { groupId: { in: allGroupIds } }, select: { groupId: true, userId: true } });
    const byGroup = new Map<string, string[]>();
    members.forEach((m) => byGroup.set(m.groupId, [...(byGroup.get(m.groupId) || []), m.userId]));
    groupIdsByCourse.forEach((groupIds, courseId) => {
      const set = learnerIdsByCourse.get(courseId) || new Set<string>();
      groupIds.forEach((gid) => (byGroup.get(gid) || []).forEach((uid) => set.add(uid)));
      learnerIdsByCourse.set(courseId, set);
    });
  }
  learnerIdsByCourse.forEach((set, courseId) => (counts[courseId] = set.size));
  return counts;
}

export async function getCourseAssignments(tenantId: string, courseId: string) {
  return prisma.courseAssignment.findMany({ where: { tenantId, courseId } });
}

export async function assignCourse(tenantId: string, assignedBy: string, dto: AssignCourseInput): Promise<{
  assignments: unknown[]; newCount: number; alreadyAssignedCount: number; alreadyAssignedIds: string[];
}> {
  // Verify course is published+assigned to tenant (MasterCourse) or legacy master
  let course = await prisma.masterCourse.findFirst({
    where: { id: dto.courseId, status: 'Published', parentCourseId: null, selectedTenants: { some: { tenantId } } },
    select: { id: true },
  });
  if (!course) {
    const legacy = await prisma.course.findFirst({
      where: { id: dto.courseId, isMaster: true, selectedTenants: { some: { tenantId } } }, select: { id: true },
    });
    course = legacy;
  }
  if (!course) throw NotFound('Course not found or not available to this tenant');

  if (dto.targetType === 'USER') {
    const users = await prisma.user.findMany({ where: { id: { in: dto.targetIds }, tenantId } });
    if (users.length !== dto.targetIds.length) throw BadRequest('One or more users do not belong to this tenant');

    if (!dto.skipPrerequisiteCheck) {
      const errors: string[] = [];
      for (const userId of dto.targetIds) {
        try {
          const { canAccess, missingCourses } = await checkPrerequisites(dto.courseId, userId, tenantId);
          if (!canAccess) {
            const u = users.find((x) => x.id === userId);
            const name = u ? `${u.firstName} ${u.lastName}` : userId;
            errors.push(`${name} must complete: ${missingCourses.join(', ')}`);
          }
        } catch { /* course may have no prereqs */ }
      }
      if (errors.length) throw Forbidden(`Prerequisites not met:\n${errors.join('\n')}`);
    }
  }

  if (dto.targetType === 'GROUP') {
    const resolved = new Set<string>();
    for (const groupId of dto.targetIds) {
      (await getGroupMemberIds(tenantId, groupId)).forEach((id) => resolved.add(id));
    }
    if (resolved.size === 0) return { assignments: [], newCount: 0, alreadyAssignedCount: 0, alreadyAssignedIds: [] };
    return assignCourse(tenantId, assignedBy, { ...dto, targetType: 'USER', targetIds: [...resolved], skipPrerequisiteCheck: true });
  }

  const assignments: unknown[] = [];
  const alreadyAssignedIds: string[] = [];
  const assignedAt = new Date();
  const dueDate = dto.dueDate ? new Date(dto.dueDate) : new Date(assignedAt.getTime() + DEFAULT_DEADLINE_DAYS * 86400000);

  for (const targetId of dto.targetIds) {
    const existing = await prisma.courseAssignment.findFirst({
      where: { tenantId, courseId: dto.courseId, targetType: dto.targetType, targetId },
    });
    if (existing) {
      alreadyAssignedIds.push(targetId);
      assignments.push(existing);
    } else {
      const created = await prisma.courseAssignment.create({
        data: {
          tenantId, courseId: dto.courseId, targetType: dto.targetType, targetId,
          dueDate, isMandatory: dto.isMandatory ?? true, assignedBy, assignedAt,
        },
      });
      assignments.push(created);
    }
  }
  return {
    assignments,
    newCount: assignments.length - alreadyAssignedIds.length,
    alreadyAssignedCount: alreadyAssignedIds.length,
    alreadyAssignedIds,
  };
}

export async function getUserAssignments(tenantId: string | null, userId: string) {
  if (!tenantId) return [];
  const assignments = await prisma.courseAssignment.findMany({
    where: { tenantId, targetType: 'USER', targetId: userId },
  });
  const courseIds = assignments.map((a) => a.courseId).filter(Boolean);
  const progresses = courseIds.length
    ? await prisma.progress.findMany({
        where: { tenantId, learnerId: userId, courseId: { in: courseIds } },
        select: { courseId: true, completionPercentage: true, status: true, completedAt: true },
      })
    : [];
  const progressByCourse = new Map(progresses.map((p) => [p.courseId, p]));

  const result = await Promise.all(
    assignments.map(async (a) => {
      let course = await prisma.masterCourse.findUnique({
        where: { id: a.courseId },
        select: { id: true, title: true, description: true, category: true, thumbnailUrl: true, modules: true, estimatedDuration: true, level: true },
      });
      let courseObj: Record<string, unknown> | null = course
        ? { _id: course.id, title: course.title, description: course.description, category: course.category, thumbnailUrl: course.thumbnailUrl, modules: course.modules || [], estimatedDuration: course.estimatedDuration, level: course.level }
        : null;
      if (!courseObj) {
        const legacy = await prisma.course.findUnique({
          where: { id: a.courseId },
          select: { id: true, title: true, description: true, category: true, thumbnailUrl: true },
        });
        if (legacy) courseObj = { _id: legacy.id, title: legacy.title, description: legacy.description, category: legacy.category, thumbnailUrl: legacy.thumbnailUrl, modules: [] };
      }

      const progress = progressByCourse.get(a.courseId);
      const completion = progress?.completionPercentage || 0;
      const isCompleted = completion >= 100 || progress?.status === 'Completed';
      const isOverdue = a.dueDate && new Date(a.dueDate).getTime() < Date.now();
      let assignmentStatus = 'ASSIGNED';
      if (isCompleted) assignmentStatus = 'COMPLETED';
      else if (isOverdue) assignmentStatus = 'OVERDUE';
      else if (completion > 0 || progress?.status === 'InProgress' || progress?.status === 'Overdue') assignmentStatus = 'IN_PROGRESS';

      return { ...a, assignmentStatus, completedAt: progress?.completedAt, courseId: courseObj };
    }),
  );
  return result.filter((a) => a.courseId !== null);
}

export async function assignCourseByBatch(tenantId: string, assignedBy: string, courseId: string, batchIds: string[], dueDate?: string, isMandatory?: boolean) {
  const allStudentIds = new Set<string>();
  const batchDetails: { batchId: string; batchName: string; studentCount: number }[] = [];
  for (const batchId of batchIds) {
    const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId }, select: { name: true } });
    if (!batch) continue;
    const students = await prisma.batchStudent.findMany({ where: { batchId }, select: { studentId: true } });
    students.forEach((s) => allStudentIds.add(s.studentId));
    batchDetails.push({ batchId, batchName: batch.name, studentCount: students.length });
  }
  if (allStudentIds.size === 0) return { assigned: 0, skipped: 0, batchDetails };
  const result = await assignCourse(tenantId, assignedBy, {
    courseId, targetType: 'USER', targetIds: [...allStudentIds], dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
  });
  const assigned = result.assignments.length;
  return { assigned, skipped: allStudentIds.size - assigned, batchDetails };
}

export async function assignCourseToAllLearners(tenantId: string, assignedBy: string, courseId: string, dueDate?: string, isMandatory?: boolean) {
  const learners = await prisma.user.findMany({ where: { tenantId, role: 'LEARNER', isActive: true }, select: { id: true } });
  if (learners.length === 0) return { assigned: 0, total: 0 };
  const result = await assignCourse(tenantId, assignedBy, {
    courseId, targetType: 'USER', targetIds: learners.map((l) => l.id), dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
  });
  return { assigned: result.assignments.length, total: learners.length };
}

export async function bulkAssignCourses(tenantId: string, assignedBy: string, courseIds: string[], targetType: AssignmentTargetType, targetIds: string[], dueDate?: string, isMandatory?: boolean) {
  const results: { courseId: string; assigned: number }[] = [];
  for (const courseId of courseIds) {
    const result = await assignCourse(tenantId, assignedBy, {
      courseId, targetType, targetIds, dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
    });
    results.push({ courseId, assigned: result.assignments.length });
  }
  return results;
}

export async function removeAssignment(tenantId: string, assignmentId: string) {
  const result = await prisma.courseAssignment.deleteMany({ where: { id: assignmentId, tenantId } });
  if (result.count === 0) throw NotFound('Assignment not found');
}
