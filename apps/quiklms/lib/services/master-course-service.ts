/**
 * Master course service — ported from MasterCourseService (Prisma).
 *
 * MasterCourse.modules/settings/draftData are JSON columns (§8); the 3-tier
 * nested authoring tree lives inside `modules`. selectedTenants is the
 * masterCourseSelectedTenant join table. Approval-workflow status transitions
 * mirror the legacy service.
 *
 * S3 presigned enrichment is implemented — see `enrichCourseWithPresignedUrls`.
 * (An earlier note in this file said it was "skipped per task note"; that left
 * every stored S3 URL unsigned, which 403s against a private bucket.)
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { LmsMasterCourse as MasterCourse, LmsMasterCourseStatus as MasterCourseStatus, LmsCourseLevel as CourseLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';
import { presignFromUrlOrKey, isManagedStorageUrl } from '@/lib/s3';
import { userHasRole, type AuthUser } from '@/lib/auth/context';

type AnyRec = Record<string, unknown>;

/** Keys inside `subModule.resourceData` the legacy enricher presigned. */
const RESOURCE_DATA_URL_KEYS = ['url', 'fileUrl', 'contentUrl', 'videoUrl'] as const;

/**
 * Presign the S3 URLs buried in a master course. 1:1 port of
 * `MasterCourseController.enrichCourseWithPresignedUrls`
 * (`master-course.controller.ts:53-82`).
 *
 * Behavior worth preserving exactly:
 *  - `thumbnailUrl` → adds a SIBLING `thumbnailUrlPresigned` field, leaving the
 *    original in place, and does so with NO `amazonaws.com` check.
 *  - `subModules[].resources[].url` and `subModules[].resourceData[{url,fileUrl,
 *    contentUrl,videoUrl}]` → rewritten IN PLACE, and only when the value points
 *    at one of our buckets. URLs we don't own pass through untouched. (Legacy
 *    checked for `amazonaws.com` specifically; that missed every GCS URL.)
 *  - A presign failure falls back to the original value (`|| res.url`), so this
 *    can never blank a URL.
 *
 * Without this, every stored course-content URL is returned unsigned and 403s
 * from a private bucket (GAP_REPORT §3.1).
 */
export type Enriched<T> = T & { thumbnailUrlPresigned?: string | null };

export async function enrichCourseWithPresignedUrls<T extends AnyRec>(course: T): Promise<Enriched<T>> {
  if (!course) return course;
  // Deep clone so we never mutate a caller's object / Prisma result in place.
  const obj = JSON.parse(JSON.stringify(course)) as AnyRec;

  if (obj.thumbnailUrl) {
    obj.thumbnailUrlPresigned = await presignFromUrlOrKey(obj.thumbnailUrl as string);
  }

  const modules = (obj.modules as AnyRec[]) || [];
  for (const mod of modules) {
    for (const sub of ((mod?.subModules as AnyRec[]) || [])) {
      for (const res of ((sub?.resources as AnyRec[]) || [])) {
        const url = res?.url as string | undefined;
        if (isManagedStorageUrl(url)) {
          res.url = (await presignFromUrlOrKey(url)) || url;
        }
      }
      const resourceData = sub?.resourceData as AnyRec | undefined;
      if (resourceData) {
        for (const key of RESOURCE_DATA_URL_KEYS) {
          const val = resourceData[key] as string | undefined;
          if (isManagedStorageUrl(val)) {
            resourceData[key] = (await presignFromUrlOrKey(val)) || val;
          }
        }
      }
    }
  }

  return obj as Enriched<T>;
}

/** Enrich a list — the legacy controller mapped enrichment over every list endpoint. */
export async function enrichCoursesWithPresignedUrls<T extends AnyRec>(courses: T[]): Promise<Enriched<T>[]> {
  return Promise.all((courses || []).map((c) => enrichCourseWithPresignedUrls(c)));
}

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
async function withSelectedTenants<T extends MasterCourse>(
  course: T,
): Promise<T & { _id: string; selectedTenants: string[] }> {
  // `_id` is the Mongo-compat alias every course screen addresses a course by:
  // approve / reject / preview / delete / duplicate / edit all build their URL
  // from `course._id`. Spreading the bare Prisma row (which has `id`) sent all
  // of them to `/master-courses/undefined/...`, so the ENTIRE tenant→super-admin
  // approval workflow 404'd on everything after submission — submission itself
  // works because a POST needs no id, which is why it looked partly alive.
  return { _id: course.id, ...course, selectedTenants: await getSelectedTenantIds(course.id) };
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

/**
 * Create (or update) a tenant's revision of a published master course.
 *
 * `statusOverride` exists to reproduce the legacy controller's forced status. Both
 * `POST :id/save` and `PUT :id` did this after calling the service
 * (`master-course.controller.ts:305-311` and `:386-390`):
 *
 *     const revision = await createOrUpdateRevisionFromPublished(...);
 *     revision.status = MasterCourseStatus.PENDING_TENANT_APPROVAL;
 *     await revision.save();
 *
 * i.e. a SUB_ADMIN's edit to a published course ALWAYS requires Tenant Admin
 * sign-off, whatever `nextStatus` computes. Losing that override was a live
 * privilege-escalation bug (GAP_REPORT §2.5): with the approval workflow off, a
 * Sub Admin's edit computed to `Published` and went live with no approval from
 * anyone; with it on, it computed to `PendingApproval` and skipped Tenant Admin
 * review to land straight in the Super Admin queue.
 *
 * It is an explicit PARAMETER, not `dto.status`, on purpose: the callers parse
 * their body with `.passthrough()`, so honoring `dto.status` would let a client
 * pick its own approval state.
 */
export async function createOrUpdateRevisionFromPublished(
  parentCourseId: string,
  orgId: string,
  editorUserId: string,
  dto: AnyRec,
  statusOverride?: MasterCourseStatus,
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
  const computedStatus: MasterCourseStatus = !approvalEnabled
    ? 'Published'
    : existingRevision?.status === 'Rejected'
      ? 'Resubmitted'
      : 'PendingApproval';
  // The caller's override wins — see the docblock. This is the §2.5 fix.
  const nextStatus: MasterCourseStatus = statusOverride ?? computedStatus;

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
/**
 * Actor predicates — 1:1 ports of `src/auth/utils/role-access.util.ts`, built on
 * the existing `userHasRole` auth helper (which checks role AND secondaryRole).
 *
 * They live here, beside `canTenantAdminEditCourse`, because they answer the same
 * question: who is allowed to touch this course. Several master-course routes
 * previously declared their own local copies, and those copies drifted:
 *
 *     // local copy — WRONG
 *     u.role === 'TENANT_ADMIN' || u.role === 'SUB_ADMIN' || u.secondaryRole === 'SUB_ADMIN'
 *
 * That misses `secondaryRole === 'TENANT_ADMIN'`, so a delegated tenant admin was
 * not recognised as a tenant actor and skipped the ownership check entirely,
 * falling through to the SUPER_ADMIN path. The legacy helper used `userHasRole`
 * for BOTH roles (`role-access.util.ts:24-32`).
 */

/** Primary or delegated Sub Admin (secondary SUB_ADMIN on a learner). */
export const isSubAdminActor = (u: AuthUser) => userHasRole(u, 'SUB_ADMIN');

/** Full tenant admin — primary role only, NOT delegated (`role-access.util.ts:19-21`). */
export const isPrimaryTenantAdmin = (u: AuthUser) => u.role === 'TENANT_ADMIN';

/** Tenant Admin or Sub Admin in any form — used for tenant-scoped admin APIs. */
export const isTenantOrSubAdminActor = (u: AuthUser) =>
  userHasRole(u, 'TENANT_ADMIN') || userHasRole(u, 'SUB_ADMIN');

/**
 * Throw unless `actor` may act on `courseId`. SUPER_ADMIN is unscoped and passes
 * through, exactly as on the sibling `PUT`/`DELETE /master-courses/:id` routes.
 *
 * This closes the five cross-tenant holes GAP_REPORT §3.2 recorded on `auto-save`,
 * `draft` GET/DELETE, `reorder-modules` and `reorder-submodules`: each passed
 * `params.id` straight to the service, and `autoSaveDraft` filters only on
 * `{id, isMaster:true}` — so any tenant admin could overwrite `draftData` on ANY
 * master course, read another tenant's unpublished draft, destroy it, or
 * restructure the course.
 *
 * NOTE: this is a deliberate BEHAVIOR CHANGE. The NestJS original had these holes
 * verbatim, so this is not migration parity — it was approved as a follow-up
 * security fix on 2026-07-17.
 *
 * `BadRequest` (400), not `Forbidden` (403), to match the message and status the
 * sibling routes already return for this exact condition.
 */
export async function assertCanEditMasterCourse(actor: AuthUser, courseId: string): Promise<void> {
  if (!isTenantOrSubAdminActor(actor)) return; // SUPER_ADMIN — unscoped.
  const existing = await findOne(courseId);
  if (!canTenantAdminEditCourse(existing, String(actor.orgId ?? undefined))) {
    throw BadRequest('You can only edit your own courses');
  }
}

export function canTenantAdminEditCourse(
  course: { submittedByTenantId?: string | null; selectedTenants?: string[] },
  orgId: string,
): boolean {
  const tenantIdStr = String(orgId);
  const submittedTenantId = course.submittedByTenantId ? String(course.submittedByTenantId) : undefined;
  const tenantScoped = (course.selectedTenants || []).includes(tenantIdStr);
  return submittedTenantId === tenantIdStr || (!submittedTenantId && tenantScoped);
}
