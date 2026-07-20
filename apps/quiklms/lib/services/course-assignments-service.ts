/**
 * Course assignments service — ported from CourseAssignmentsService (Prisma).
 *
 * courseId is scalar (refs MasterCourse or legacy Course). Group membership is
 * resolved via the groupMember join table (Group.memberIds → GroupMember).
 *
 * S3 thumbnail presigning is DONE — see `enrichAssignmentsWithPresignedUrls`.
 *
 * REMINDERS: the immediate "course assigned" email is sent HERE, at assign time
 * (`handleNewAssignments`), which is what the worker's cron docblock already
 * assumed. An earlier note claimed the worker handled it; the worker claimed the
 * REST layer did, so nobody sent it. The day-10/20 follow-ups remain the
 * worker's job — it scans `assignedAt` windows daily rather than pre-scheduling
 * BullMQ jobs (BullMQ is not installed here).
 *
 * `cancelAssignmentReminders` has no equivalent and needs none: there are no
 * scheduled jobs to cancel under the scan model — a deleted assignment simply
 * stops matching the cron's query.
 */
import type { LmsAssignmentTargetType as AssignmentTargetType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest, Forbidden } from '@/lib/http';
import { presignFromUrlOrKey } from '@/lib/s3';
import { handleNewAssignments } from '@/lib/services/course-assignment-reminders-service';

const DEFAULT_DEADLINE_DAYS = 21;

type AnyRec = Record<string, unknown>;

/**
 * Add `thumbnailUrlPresigned` beside `thumbnailUrl` — port of the controller's
 * private `enrichCoursesWithPresignedUrls` (`course-assignments.controller.ts:41-55`).
 *
 * Deliberately NOT `courses-service.enrichCoursesWithPresignedUrls`, which is a
 * superset (lesson contentUrl, scormLaunchUrl, captions, resourceData). This
 * endpoint's legacy enrich touches the thumbnail ONLY — plus the nested
 * `courseId.thumbnailUrl` when courseId is populated, which is what
 * `my-assignments` returns. Reusing the bigger one would add fields and queries
 * the legacy never produced.
 *
 * The stored url is left untouched; the presigned one is added alongside, and
 * `presignFromUrlOrKey` never throws.
 */
export async function enrichAssignmentsWithPresignedUrls<T extends AnyRec>(items: T[]): Promise<T[]> {
  return Promise.all(
    (items || []).map(async (item) => {
      const obj = { ...item } as AnyRec;
      if (typeof obj.thumbnailUrl === 'string' && obj.thumbnailUrl) {
        obj.thumbnailUrlPresigned = await presignFromUrlOrKey(obj.thumbnailUrl);
      }
      const course = obj.courseId;
      if (course && typeof course === 'object') {
        const c = { ...(course as AnyRec) };
        if (typeof c.thumbnailUrl === 'string' && c.thumbnailUrl) {
          c.thumbnailUrlPresigned = await presignFromUrlOrKey(c.thumbnailUrl);
          obj.courseId = c;
        }
      }
      return obj as T;
    }),
  );
}

export interface AssignCourseInput {
  courseId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
  dueDate?: string;
  isMandatory?: boolean;
  skipPrerequisiteCheck?: boolean;
}

async function getGroupMemberIds(orgId: string, groupId: string): Promise<string[]> {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound(`Group ${groupId} not found`);
  const members = await prisma.lmsGroupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

export async function checkPrerequisites(courseId: string, userId: string, orgId: string) {
  // Resolve course + its prerequisites. MasterCourse stores no prereq relation;
  // legacy Course has CoursePrerequisite. Try Course first for prereqs.
  const course = await prisma.lmsCourse.findUnique({
    where: { id: courseId },
    include: { prerequisites: { select: { prerequisiteId: true } } },
  });
  const masterExists = course ? null : await prisma.lmsMasterCourse.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course && !masterExists) throw NotFound('Course not found');

  const prereqIds = (course?.prerequisites || []).map((p) => p.prerequisiteId);
  if (prereqIds.length === 0) return { canAccess: true, missingCourses: [] as string[] };

  const completed = await prisma.lmsProgress.findMany({
    where: { orgId, learnerId: userId, courseId: { in: prereqIds }, status: 'Completed' },
    select: { courseId: true },
  });
  const completedSet = new Set(completed.map((p) => p.courseId));
  const missingIds = prereqIds.filter((id) => !completedSet.has(id));
  if (missingIds.length === 0) return { canAccess: true, missingCourses: [] as string[] };

  const missingCourses: string[] = [];
  for (const id of missingIds) {
    const mc = await prisma.lmsMasterCourse.findUnique({ where: { id }, select: { title: true } });
    if (mc) { missingCourses.push(mc.title); continue; }
    const c = await prisma.lmsCourse.findUnique({ where: { id }, select: { title: true } });
    if (c) missingCourses.push(c.title);
  }
  return { canAccess: false, missingCourses };
}

export async function getAssignedCourses(orgId: string | null | undefined) {
  // MasterCourses published + assigned to this tenant (or all for super admin)
  const tenantFilter = orgId ? { selectedTenants: { some: { orgId } } } : {};
  const masterCourses = await prisma.lmsMasterCourse.findMany({
    where: { status: 'Published', parentCourseId: null, ...tenantFilter },
    orderBy: { createdAt: 'desc' },
  });

  let ownPending: typeof masterCourses = [];
  if (orgId) {
    ownPending = await prisma.lmsMasterCourse.findMany({
      where: { status: { not: 'Published' }, parentCourseId: null, submittedByTenantId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  const legacyCourses = await prisma.lmsCourse.findMany({
    where: { isMaster: true, ...(orgId ? { selectedTenants: { some: { orgId } } } : {}) },
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

  const counts = await countEnrolledLearnersByCourseIds(all.map((c) => c._id), orgId);
  return all.map((c) => ({ ...c, enrolledCount: counts[c._id] ?? 0 }));
}

export async function countEnrolledLearnersByCourseIds(courseIds: string[], orgId: string | null | undefined) {
  const counts: Record<string, number> = {};
  if (courseIds.length === 0) return counts;
  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { courseId: { in: courseIds }, ...(orgId ? { orgId } : {}) },
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
    const members = await prisma.lmsGroupMember.findMany({ where: { groupId: { in: allGroupIds } }, select: { groupId: true, userId: true } });
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

export async function getCourseAssignments(orgId: string, courseId: string) {
  return prisma.lmsCourseAssignment.findMany({ where: { orgId, courseId } });
}

export async function assignCourse(orgId: string, assignedBy: string, dto: AssignCourseInput): Promise<{
  assignments: unknown[]; newCount: number; alreadyAssignedCount: number; alreadyAssignedIds: string[];
}> {
  // Verify course is published+assigned to tenant (MasterCourse) or legacy master
  let course = await prisma.lmsMasterCourse.findFirst({
    where: { id: dto.courseId, status: 'Published', parentCourseId: null, selectedTenants: { some: { orgId } } },
    select: { id: true },
  });
  if (!course) {
    const legacy = await prisma.lmsCourse.findFirst({
      where: { id: dto.courseId, isMaster: true, selectedTenants: { some: { orgId } } }, select: { id: true },
    });
    course = legacy;
  }
  if (!course) throw NotFound('Course not found or not available to this tenant');

  if (dto.targetType === 'USER') {
    const users = await prisma.lmsUser.findMany({ where: { id: { in: dto.targetIds }, orgId } });
    if (users.length !== dto.targetIds.length) throw BadRequest('One or more users do not belong to this tenant');

    if (!dto.skipPrerequisiteCheck) {
      const errors: string[] = [];
      for (const userId of dto.targetIds) {
        try {
          const { canAccess, missingCourses } = await checkPrerequisites(dto.courseId, userId, orgId);
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
      (await getGroupMemberIds(orgId, groupId)).forEach((id) => resolved.add(id));
    }
    if (resolved.size === 0) return { assignments: [], newCount: 0, alreadyAssignedCount: 0, alreadyAssignedIds: [] };
    return assignCourse(orgId, assignedBy, { ...dto, targetType: 'USER', targetIds: [...resolved], skipPrerequisiteCheck: true });
  }

  const assignments: unknown[] = [];
  const alreadyAssignedIds: string[] = [];
  const newAssignmentIds: string[] = [];
  const assignedAt = new Date();
  const dueDate = dto.dueDate ? new Date(dto.dueDate) : new Date(assignedAt.getTime() + DEFAULT_DEADLINE_DAYS * 86400000);

  for (const targetId of dto.targetIds) {
    const existing = await prisma.lmsCourseAssignment.findFirst({
      where: { orgId, courseId: dto.courseId, targetType: dto.targetType, targetId },
    });
    if (existing) {
      alreadyAssignedIds.push(targetId);
      assignments.push(existing);
    } else {
      const created = await prisma.lmsCourseAssignment.create({
        data: {
          orgId, courseId: dto.courseId, targetType: dto.targetType, targetId,
          dueDate, isMandatory: dto.isMandatory ?? true, assignedBy, assignedAt,
        },
      });
      assignments.push(created);
      newAssignmentIds.push(created.id);
    }
  }

  // Immediate "course assigned" email per NEWLY created assignment — port of the
  // fire-and-forget `handleNewAssignment` loop (`course-assignments.service.ts:479-486`).
  // Not awaited: "Failures here must not block the assignment creation."
  // `handleNewAssignments` never throws, so there is no unhandled rejection.
  if (newAssignmentIds.length) void handleNewAssignments(newAssignmentIds);

  return {
    assignments,
    newCount: assignments.length - alreadyAssignedIds.length,
    alreadyAssignedCount: alreadyAssignedIds.length,
    alreadyAssignedIds,
  };
}

export async function getUserAssignments(orgId: string | null, userId: string) {
  if (!orgId) return [];
  const assignments = await prisma.lmsCourseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: userId },
  });
  const courseIds = assignments.map((a) => a.courseId).filter(Boolean);
  const progresses = courseIds.length
    ? await prisma.lmsProgress.findMany({
        where: { orgId, learnerId: userId, courseId: { in: courseIds } },
        select: { courseId: true, completionPercentage: true, status: true, completedAt: true },
      })
    : [];
  const progressByCourse = new Map(progresses.map((p) => [p.courseId, p]));

  const result = await Promise.all(
    assignments.map(async (a) => {
      let course = await prisma.lmsMasterCourse.findUnique({
        where: { id: a.courseId },
        select: { id: true, title: true, description: true, category: true, thumbnailUrl: true, modules: true, estimatedDuration: true, level: true },
      });
      let courseObj: Record<string, unknown> | null = course
        ? { _id: course.id, title: course.title, description: course.description, category: course.category, thumbnailUrl: course.thumbnailUrl, modules: course.modules || [], estimatedDuration: course.estimatedDuration, level: course.level }
        : null;
      if (!courseObj) {
        const legacy = await prisma.lmsCourse.findUnique({
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

export async function assignCourseByBatch(orgId: string, assignedBy: string, courseId: string, batchIds: string[], dueDate?: string, isMandatory?: boolean) {
  const allStudentIds = new Set<string>();
  const batchDetails: { batchId: string; batchName: string; studentCount: number }[] = [];
  for (const batchId of batchIds) {
    const batch = await prisma.lmsBatch.findFirst({ where: { id: batchId, orgId }, select: { name: true } });
    if (!batch) continue;
    const students = await prisma.lmsBatchStudent.findMany({ where: { batchId }, select: { studentId: true } });
    students.forEach((s) => allStudentIds.add(s.studentId));
    batchDetails.push({ batchId, batchName: batch.name, studentCount: students.length });
  }
  if (allStudentIds.size === 0) return { assigned: 0, skipped: 0, batchDetails };
  const result = await assignCourse(orgId, assignedBy, {
    courseId, targetType: 'USER', targetIds: [...allStudentIds], dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
  });
  const assigned = result.assignments.length;
  return { assigned, skipped: allStudentIds.size - assigned, batchDetails };
}

export async function assignCourseToAllLearners(orgId: string, assignedBy: string, courseId: string, dueDate?: string, isMandatory?: boolean) {
  const learners = await prisma.lmsUser.findMany({ where: { orgId, role: 'LEARNER', isActive: true }, select: { id: true } });
  if (learners.length === 0) return { assigned: 0, total: 0 };
  const result = await assignCourse(orgId, assignedBy, {
    courseId, targetType: 'USER', targetIds: learners.map((l) => l.id), dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
  });
  return { assigned: result.assignments.length, total: learners.length };
}

export async function bulkAssignCourses(orgId: string, assignedBy: string, courseIds: string[], targetType: AssignmentTargetType, targetIds: string[], dueDate?: string, isMandatory?: boolean) {
  const results: { courseId: string; assigned: number }[] = [];
  for (const courseId of courseIds) {
    const result = await assignCourse(orgId, assignedBy, {
      courseId, targetType, targetIds, dueDate, isMandatory: isMandatory ?? true, skipPrerequisiteCheck: true,
    });
    results.push({ courseId, assigned: result.assignments.length });
  }
  return results;
}

export async function removeAssignment(orgId: string, assignmentId: string) {
  const result = await prisma.lmsCourseAssignment.deleteMany({ where: { id: assignmentId, orgId } });
  if (result.count === 0) throw NotFound('Assignment not found');
}
