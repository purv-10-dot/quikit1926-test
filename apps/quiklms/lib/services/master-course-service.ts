/**
 * Master course service — ported from MasterCourseService (Prisma).
 *
 * MasterCourse.modules/settings/draftData are JSON columns (§8); the 3-tier
 * nested authoring tree lives inside `modules`. selectedTenants is the
 * masterCourseSelectedTenant join table. Approval-workflow status transitions
 * mirror the legacy service.
 *
 * S3 presigned enrichment is skipped per task note (stored URLs returned as-is).
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { LmsMasterCourse as MasterCourse, LmsMasterCourseStatus as MasterCourseStatus, LmsCourseLevel as CourseLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

type AnyRec = Record<string, unknown>;

// ── tenant feature: approval workflow ────────────────────────────────────────
export async function isApprovalWorkflowEnabled(orgId: string): Promise<boolean> {
  try {
    const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { featureConfig: true } });
    const config = (tenant?.featureConfig as AnyRec) || {};
    return config.approvalWorkflowEnabled !== false;
  } catch {
    return true;
  }
}

// ── selectedTenants helpers (join table) ─────────────────────────────────────
async function setSelectedTenants(masterCourseId: string, tenantIds: string[]): Promise<void> {
  await prisma.lmsMasterCourseSelectedTenant.deleteMany({ where: { masterCourseId } });
  if (tenantIds.length) {
    await prisma.lmsMasterCourseSelectedTenant.createMany({
      data: tenantIds.map((orgId) => ({ masterCourseId, orgId })),
      skipDuplicates: true,
    });
  }
}

async function getSelectedTenantIds(masterCourseId: string): Promise<string[]> {
  const rows = await prisma.lmsMasterCourseSelectedTenant.findMany({
    where: { masterCourseId }, select: { orgId: true },
  });
  return rows.map((r) => r.orgId);
}

/** Attach selectedTenants id list to a course object for the response shape. */
async function withSelectedTenants<T extends MasterCourse>(course: T): Promise<T & { selectedTenants: string[] }> {
  return { ...course, selectedTenants: await getSelectedTenantIds(course.id) };
}

// ── quiz sanitisation (port of sanitizeQuizQuestions) ────────────────────────
function sanitizeQuizQuestions(questions: AnyRec[] = []): AnyRec[] {
  return (questions || []).map((q) => {
    const options = (q.options as AnyRec[]) || [];
    if (options.length === 0) return { ...q, id: q.id || randomUUID() };

    const validOptions: AnyRec[] = [];
    const indexMap = new Map<number, number>();
    options.forEach((opt, originalIdx) => {
      const text = opt.text as string | undefined;
      if (text && text.trim() !== '') {
        indexMap.set(originalIdx, validOptions.length);
        validOptions.push({ ...opt, id: opt.id || randomUUID() });
      }
    });

    let correctAnswer = q.correctAnswer;
    if (typeof correctAnswer === 'number') {
      correctAnswer = indexMap.get(correctAnswer) ?? 0;
    } else if (Array.isArray(correctAnswer)) {
      correctAnswer = (correctAnswer as number[]).map((idx) => indexMap.get(idx)).filter((idx) => idx !== undefined);
    }
    return { ...q, id: q.id || randomUUID(), options: validOptions, correctAnswer };
  });
}

function generateModuleIds(modules: AnyRec[] = []): AnyRec[] {
  return (modules || []).map((module, moduleIndex) => ({
    ...module,
    id: module.id || randomUUID(),
    orderIndex: module.orderIndex ?? moduleIndex,
    subModules: ((module.subModules as AnyRec[]) || []).map((subModule, subIndex) => ({
      ...subModule,
      id: subModule.id || randomUUID(),
      orderIndex: subModule.orderIndex ?? subIndex,
      resources: ((subModule.resources as AnyRec[]) || []).map((resource, resIndex) => ({
        ...resource,
        id: resource.id || randomUUID(),
        orderIndex: resource.orderIndex ?? resIndex,
      })),
      quiz: subModule.quiz
        ? { ...(subModule.quiz as AnyRec), id: (subModule.quiz as AnyRec).id || randomUUID(), questions: sanitizeQuizQuestions((subModule.quiz as AnyRec).questions as AnyRec[]) }
        : undefined,
      assignment: subModule.assignment
        ? { ...(subModule.assignment as AnyRec), id: (subModule.assignment as AnyRec).id || randomUUID() }
        : undefined,
    })),
    moduleEndQuiz: module.moduleEndQuiz
      ? { ...(module.moduleEndQuiz as AnyRec), id: (module.moduleEndQuiz as AnyRec).id || randomUUID(), questions: sanitizeQuizQuestions((module.moduleEndQuiz as AnyRec).questions as AnyRec[]) }
      : undefined,
  }));
}

const DEFAULT_SETTINGS = {
  sequentialProgression: false,
  certificateEnabled: true,
  passingScore: 70,
  allowRevisit: true,
  showProgressBar: true,
};

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function create(authorId: string, dto: AnyRec): Promise<MasterCourse & { selectedTenants: string[] }> {
  const modules = generateModuleIds((dto.modules as AnyRec[]) || []);
  const selectedTenantIds = (dto.selectedTenants as string[]) || [];

  const course = await prisma.lmsMasterCourse.create({
    data: {
      title: String(dto.title ?? ''),
      description: dto.description ? String(dto.description) : undefined,
      category: dto.category ? String(dto.category) : undefined,
      level: (dto.level as CourseLevel) ?? undefined,
      thumbnailUrl: dto.thumbnailUrl ? String(dto.thumbnailUrl) : undefined,
      aiGeneratedThumbnail: dto.aiGeneratedThumbnail === true,
      authorId,
      isMaster: true,
      status: ((dto.status as MasterCourseStatus) || 'Draft'),
      tags: (dto.tags as string[]) ?? [],
      estimatedDuration: typeof dto.estimatedDuration === 'number' ? (dto.estimatedDuration as number) : undefined,
      modules: modules as unknown as Prisma.InputJsonValue,
      settings: ((dto.settings as Prisma.InputJsonValue) ?? DEFAULT_SETTINGS),
      submittedBy: dto.submittedBy ? String(dto.submittedBy) : undefined,
      submittedByTenantId: dto.submittedByTenantId ? String(dto.submittedByTenantId) : undefined,
    },
  });
  await setSelectedTenants(course.id, selectedTenantIds);
  return withSelectedTenants(course);
}

export async function findAll() {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: { isMaster: true, parentCourseId: null },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function findOne(id: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  return withSelectedTenants(course);
}

export async function update(id: string, dto: AnyRec) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');

  const incomingModules = (dto.modules as AnyRec[]) ?? (course.modules as unknown as AnyRec[]);
  const modules = generateModuleIds(incomingModules);

  const data: Prisma.LmsMasterCourseUpdateInput = {};
  if (dto.title !== undefined) data.title = String(dto.title);
  if (dto.description !== undefined) data.description = String(dto.description);
  if (dto.category !== undefined) data.category = String(dto.category);
  if (dto.level !== undefined) data.level = dto.level as CourseLevel;
  if (dto.thumbnailUrl !== undefined) data.thumbnailUrl = String(dto.thumbnailUrl);
  if (dto.aiGeneratedThumbnail !== undefined) data.aiGeneratedThumbnail = dto.aiGeneratedThumbnail === true;
  if (dto.tags !== undefined) data.tags = dto.tags as string[];
  if (dto.estimatedDuration !== undefined) data.estimatedDuration = dto.estimatedDuration as number;
  if (dto.status !== undefined) data.status = dto.status as MasterCourseStatus;
  data.modules = modules as unknown as Prisma.InputJsonValue;
  if (dto.settings) {
    data.settings = { ...((course.settings as AnyRec) || {}), ...(dto.settings as AnyRec) } as Prisma.InputJsonValue;
  }
  if (dto.submittedBy) data.submittedBy = String(dto.submittedBy);
  if (dto.submittedByTenantId) data.submittedByTenantId = String(dto.submittedByTenantId);
  data.version = (course.version || 1) + 1;
  data.draftData = Prisma.JsonNull;
  data.lastAutoSaveAt = null;

  const updated = await prisma.lmsMasterCourse.update({ where: { id }, data });
  if (dto.selectedTenants !== undefined) await setSelectedTenants(id, (dto.selectedTenants as string[]) || []);
  return withSelectedTenants(updated);
}

export async function createOrUpdateRevisionFromPublished(
  parentCourseId: string,
  orgId: string,
  editorUserId: string,
  dto: AnyRec,
) {
  const parent = await prisma.lmsMasterCourse.findFirst({ where: { id: parentCourseId, isMaster: true } });
  if (!parent) throw NotFound('Master course not found');

  const rawModules = (dto.modules as AnyRec[]) ?? (parent.modules as unknown as AnyRec[]);
  const payload = {
    title: (dto.title as string) ?? parent.title,
    description: (dto.description as string) ?? parent.description,
    category: (dto.category as string) ?? parent.category,
    level: (dto.level as CourseLevel) ?? parent.level,
    thumbnailUrl: (dto.thumbnailUrl as string) ?? parent.thumbnailUrl,
    aiGeneratedThumbnail: (dto.aiGeneratedThumbnail as boolean) ?? parent.aiGeneratedThumbnail,
    modules: generateModuleIds(rawModules),
    settings: { ...((parent.settings as AnyRec) || {}), ...((dto.settings as AnyRec) || {}) },
    tags: (dto.tags as string[]) ?? parent.tags ?? [],
    estimatedDuration: (dto.estimatedDuration as number) ?? parent.estimatedDuration,
  };

  const existingRevision = await prisma.lmsMasterCourse.findFirst({
    where: {
      parentCourseId: parent.id,
      submittedByTenantId: orgId,
      status: { in: ['PendingApproval', 'PendingTenantApproval', 'RejectedByTenantAdmin', 'Resubmitted', 'Rejected'] },
    },
  });

  const approvalEnabled = await isApprovalWorkflowEnabled(orgId);
  const nextStatus: MasterCourseStatus = !approvalEnabled
    ? 'Published'
    : existingRevision?.status === 'Rejected'
      ? 'Resubmitted'
      : 'PendingApproval';

  if (existingRevision) {
    const updated = await prisma.lmsMasterCourse.update({
      where: { id: existingRevision.id },
      data: {
        title: payload.title,
        description: payload.description,
        category: payload.category,
        level: payload.level,
        thumbnailUrl: payload.thumbnailUrl,
        aiGeneratedThumbnail: payload.aiGeneratedThumbnail,
        modules: payload.modules as unknown as Prisma.InputJsonValue,
        settings: payload.settings as Prisma.InputJsonValue,
        tags: payload.tags,
        estimatedDuration: payload.estimatedDuration,
        status: nextStatus,
        rejectionReason: null,
        approvedBy: null,
        approvalDate: null,
        version: (existingRevision.version || 1) + 1,
        revisionNumber: (parent.revisionNumber || parent.version || 1) + 1,
        draftData: Prisma.JsonNull,
        lastAutoSaveAt: null,
      },
    });
    await setSelectedTenants(updated.id, [orgId]);
    return withSelectedTenants(updated);
  }

  const revision = await prisma.lmsMasterCourse.create({
    data: {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      level: payload.level,
      thumbnailUrl: payload.thumbnailUrl,
      aiGeneratedThumbnail: payload.aiGeneratedThumbnail,
      modules: payload.modules as unknown as Prisma.InputJsonValue,
      settings: payload.settings as Prisma.InputJsonValue,
      status: nextStatus,
      isMaster: true,
      tags: payload.tags,
      estimatedDuration: payload.estimatedDuration,
      authorId: parent.authorId,
      submittedBy: editorUserId,
      submittedByTenantId: orgId,
      parentCourseId: parent.id,
      version: (parent.version || 1) + 1,
      revisionNumber: (parent.revisionNumber || parent.version || 1) + 1,
    },
  });
  await setSelectedTenants(revision.id, [orgId]);
  return withSelectedTenants(revision);
}

export async function autoSaveDraft(courseId: string, draftData: AnyRec) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id: courseId, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  return prisma.lmsMasterCourse.update({
    where: { id: courseId },
    data: { draftData: draftData as Prisma.InputJsonValue, lastAutoSaveAt: new Date() },
  });
}

export async function getDraft(courseId: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id: courseId, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  return course.draftData ?? null;
}

export async function discardDraft(courseId: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id: courseId, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  return prisma.lmsMasterCourse.update({
    where: { id: courseId },
    data: { draftData: Prisma.JsonNull, lastAutoSaveAt: null },
  });
}

export async function publish(id: string, tenantIds: string[]) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  const modules = (course.modules as unknown as AnyRec[]) || [];
  if (modules.length === 0) throw BadRequest('Cannot publish course without modules');
  const updated = await prisma.lmsMasterCourse.update({ where: { id }, data: { status: 'Published' } });
  await setSelectedTenants(id, tenantIds || []);
  return withSelectedTenants(updated);
}

export async function archive(id: string) {
  await findOne(id);
  const updated = await prisma.lmsMasterCourse.update({ where: { id }, data: { status: 'Archived' } });
  return withSelectedTenants(updated);
}

export async function remove(id: string) {
  await findOne(id);
  await prisma.lmsMasterCourse.delete({ where: { id } });
}

export async function duplicate(id: string, authorId: string) {
  const original = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!original) throw NotFound('Master course not found');
  const modules = ((original.modules as unknown as AnyRec[]) || []).map((module) => ({
    ...module,
    id: randomUUID(),
    subModules: ((module.subModules as AnyRec[]) || []).map((subModule) => ({
      ...subModule,
      id: randomUUID(),
      resources: ((subModule.resources as AnyRec[]) || []).map((resource) => ({ ...resource, id: randomUUID() })),
      quiz: subModule.quiz
        ? { ...(subModule.quiz as AnyRec), id: randomUUID(), questions: ((subModule.quiz as AnyRec).questions as AnyRec[] || []).map((q) => ({ ...q, id: randomUUID() })) }
        : undefined,
      assignment: subModule.assignment ? { ...(subModule.assignment as AnyRec), id: randomUUID() } : undefined,
    })),
    moduleEndQuiz: module.moduleEndQuiz
      ? { ...(module.moduleEndQuiz as AnyRec), id: randomUUID(), questions: ((module.moduleEndQuiz as AnyRec).questions as AnyRec[] || []).map((q) => ({ ...q, id: randomUUID() })) }
      : undefined,
  }));

  const copy = await prisma.lmsMasterCourse.create({
    data: {
      title: `${original.title} (Copy)`,
      description: original.description,
      category: original.category,
      level: original.level,
      thumbnailUrl: original.thumbnailUrl,
      aiGeneratedThumbnail: original.aiGeneratedThumbnail,
      authorId,
      isMaster: true,
      status: 'Draft',
      tags: original.tags,
      estimatedDuration: original.estimatedDuration,
      modules: modules as unknown as Prisma.InputJsonValue,
      settings: (original.settings as Prisma.InputJsonValue) ?? {},
      version: 1,
    },
  });
  return withSelectedTenants(copy);
}

export async function reorderModules(courseId: string, moduleIds: string[]) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id: courseId, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  const modules = (course.modules as unknown as AnyRec[]) || [];
  const moduleMap = new Map(modules.map((m) => [m.id as string, m]));
  const reordered = moduleIds.map((id, index) => {
    const m = moduleMap.get(id);
    if (!m) throw BadRequest(`Module with ID ${id} not found`);
    return { ...m, orderIndex: index };
  });
  const updated = await prisma.lmsMasterCourse.update({
    where: { id: courseId }, data: { modules: reordered as unknown as Prisma.InputJsonValue },
  });
  return withSelectedTenants(updated);
}

export async function reorderSubModules(courseId: string, moduleId: string, subModuleIds: string[]) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id: courseId, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  const modules = (course.modules as unknown as AnyRec[]) || [];
  const moduleIndex = modules.findIndex((m) => m.id === moduleId);
  if (moduleIndex === -1) throw BadRequest('Module not found');
  const module = modules[moduleIndex];
  const subModules = (module.subModules as AnyRec[]) || [];
  const subMap = new Map(subModules.map((sm) => [sm.id as string, sm]));
  const reorderedSubs = subModuleIds.map((id, index) => {
    const sm = subMap.get(id);
    if (!sm) throw BadRequest(`Sub-module with ID ${id} not found`);
    return { ...sm, orderIndex: index };
  });
  modules[moduleIndex] = { ...module, subModules: reorderedSubs };
  const updated = await prisma.lmsMasterCourse.update({
    where: { id: courseId }, data: { modules: modules as unknown as Prisma.InputJsonValue },
  });
  return withSelectedTenants(updated);
}

// ── approval workflow queries ────────────────────────────────────────────────
export async function findPendingApprovals() {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: { status: { in: ['PendingApproval', 'Resubmitted'] } },
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function findAllApprovalItems() {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: {
      submittedByTenantId: { not: null },
      status: { in: ['PendingApproval', 'PendingTenantApproval', 'RejectedByTenantAdmin', 'Resubmitted', 'Published', 'Rejected'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function findBySubmittedTenant(orgId: string) {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: {
      submittedByTenantId: orgId,
      status: { in: ['PendingApproval', 'PendingTenantApproval', 'RejectedByTenantAdmin', 'Resubmitted', 'Rejected', 'Published'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function findBySubmittedUser(userId: string) {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: { submittedBy: userId },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function findSubAdminSubmissions(orgId: string) {
  const courses = await prisma.lmsMasterCourse.findMany({
    where: {
      submittedByTenantId: orgId,
      status: { in: ['PendingTenantApproval', 'RejectedByTenantAdmin', 'PendingApproval', 'Published', 'Rejected'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(courses.map(withSelectedTenants));
}

export async function tenantApprove(id: string, tenantAdminUserId: string, orgId: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  if (course.status !== 'PendingTenantApproval') throw BadRequest('Only courses pending Tenant Admin approval can be approved');
  if (course.submittedByTenantId !== orgId) throw BadRequest('You can only approve courses from your own organization');
  const updated = await prisma.lmsMasterCourse.update({
    where: { id },
    data: { tenantApprovedBy: tenantAdminUserId, tenantApprovalDate: new Date(), tenantRejectionReason: null, status: 'PendingApproval' },
  });
  return withSelectedTenants(updated);
}

export async function tenantReject(id: string, _tenantAdminUserId: string, orgId: string, reason: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  if (course.status !== 'PendingTenantApproval') throw BadRequest('Only courses pending Tenant Admin approval can be rejected');
  if (course.submittedByTenantId !== orgId) throw BadRequest('You can only reject courses from your own organization');
  const updated = await prisma.lmsMasterCourse.update({
    where: { id }, data: { tenantRejectionReason: reason, status: 'RejectedByTenantAdmin' },
  });
  return withSelectedTenants(updated);
}

export async function approve(id: string, approvedById: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  if (course.status !== 'PendingApproval' && course.status !== 'Resubmitted') {
    throw BadRequest('Only pending or resubmitted courses can be approved');
  }

  if (course.parentCourseId) {
    const parent = await prisma.lmsMasterCourse.findFirst({ where: { id: course.parentCourseId, isMaster: true } });
    if (!parent) throw NotFound('Master course not found');
    const parentUpdated = await prisma.lmsMasterCourse.update({
      where: { id: parent.id },
      data: {
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        thumbnailUrl: course.thumbnailUrl,
        aiGeneratedThumbnail: course.aiGeneratedThumbnail,
        modules: course.modules as unknown as Prisma.InputJsonValue,
        settings: (course.settings as Prisma.InputJsonValue) ?? {},
        tags: [...(course.tags || [])],
        estimatedDuration: course.estimatedDuration,
        status: 'Published',
        approvedBy: approvedById,
        approvalDate: new Date(),
        rejectionReason: null,
        version: (parent.version || 1) + 1,
        revisionNumber: Math.max(parent.revisionNumber || 1, course.revisionNumber || 1),
      },
    });
    await setSelectedTenants(parent.id, await getSelectedTenantIds(course.id));
    await prisma.lmsMasterCourse.update({
      where: { id: course.id },
      data: { status: 'Archived', approvedBy: approvedById, approvalDate: new Date(), rejectionReason: null },
    });
    return withSelectedTenants(parentUpdated);
  }

  const updated = await prisma.lmsMasterCourse.update({
    where: { id },
    data: { status: 'Published', approvedBy: approvedById, approvalDate: new Date(), rejectionReason: null },
  });
  return withSelectedTenants(updated);
}

export async function reject(id: string, rejectedById: string, reason: string) {
  const course = await prisma.lmsMasterCourse.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  if (course.status !== 'PendingApproval' && course.status !== 'Resubmitted') {
    throw BadRequest('Only pending or resubmitted courses can be rejected');
  }
  const updated = await prisma.lmsMasterCourse.update({
    where: { id },
    data: { status: 'Rejected', approvedBy: rejectedById, approvalDate: new Date(), rejectionReason: reason },
  });
  return withSelectedTenants(updated);
}

// ── controller-side ownership check (canTenantAdminEditCourse) ────────────────
export function canTenantAdminEditCourse(
  course: { submittedByTenantId?: string | null; selectedTenants?: string[] },
  orgId: string,
): boolean {
  const tenantIdStr = String(orgId);
  const submittedTenantId = course.submittedByTenantId ? String(course.submittedByTenantId) : undefined;
  const tenantScoped = (course.selectedTenants || []).includes(tenantIdStr);
  return submittedTenantId === tenantIdStr || (!submittedTenantId && tenantScoped);
}
