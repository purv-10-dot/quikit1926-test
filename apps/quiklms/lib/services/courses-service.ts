/**
 * Courses service — ported from CoursesService (Prisma).
 *
 * Two collections in the legacy app: relational `Course` (modules via
 * Module.courseId; selectedTenants via CourseSelectedTenant) and the JSON-blob
 * `MasterCourse` (3-tier modules in a Json column). findAll/findOne merge both.
 *
 * S3 presigned enrichment is intentionally skipped per task note — stored URLs
 * are returned as-is.
 */
import type { Prisma, LessonType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound } from '@/lib/http';

const MODULES_INCLUDE = {
  modules: { include: { lessons: { orderBy: { orderIndex: 'asc' } } }, orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.CourseInclude;

export async function createCourse(tenantId: string, authorId: string, dto: Record<string, unknown>) {
  const { modules: _m, selectedTenants: _s, ...rest } = dto as Record<string, unknown>;
  return prisma.course.create({
    data: { ...(rest as Prisma.CourseCreateInput), tenantId, authorId },
  });
}

/**
 * All courses visible to a tenant: legacy tenant courses + master courses
 * distributed to it, plus published MasterCourse docs assigned to it.
 */
export async function findAllForTenant(tenantId: string) {
  const legacyCourses = await prisma.course.findMany({
    where: {
      OR: [
        { tenantId },
        { isMaster: true, selectedTenants: { some: { tenantId } } },
      ],
    },
    include: MODULES_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const masterCourses = await prisma.masterCourse.findMany({
    where: {
      status: 'Published',
      selectedTenants: { some: { tenantId } },
      parentCourseId: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  const merged = [
    ...legacyCourses,
    ...masterCourses.map((mc) => ({
      id: mc.id,
      title: mc.title,
      description: mc.description,
      category: mc.category,
      thumbnailUrl: mc.thumbnailUrl,
      status: mc.status,
      isMaster: mc.isMaster,
      modules: mc.modules,
      createdAt: mc.createdAt,
      updatedAt: mc.updatedAt,
      source: 'master' as const,
    })),
  ];

  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return merged;
}

export async function findAllMaster() {
  return prisma.course.findMany({
    where: { isMaster: true },
    include: MODULES_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

export async function findOneMaster(id: string) {
  const course = await prisma.course.findFirst({
    where: { id, isMaster: true },
    include: MODULES_INCLUDE,
  });
  if (!course) throw NotFound('Master course not found');
  return course;
}

export async function findOne(id: string, tenantId: string) {
  // First try a published MasterCourse assigned to this tenant.
  const masterCourse = await prisma.masterCourse.findFirst({
    where: { id, status: 'Published', parentCourseId: null, selectedTenants: { some: { tenantId } } },
  });
  if (masterCourse) return transformMasterCourseForPlayer(masterCourse);

  // Fall back to legacy Course collection (tenant-owned or master assigned).
  const course = await prisma.course.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { isMaster: true, selectedTenants: { some: { tenantId } } }],
    },
    include: MODULES_INCLUDE,
  });
  if (!course) throw NotFound(`Course with ID ${id} not found`);
  return course;
}

export async function addModule(tenantId: string, dto: { courseId: string; title: string; description?: string; orderIndex?: number; assessmentId?: string }) {
  const course = await prisma.course.findFirst({ where: { id: dto.courseId, tenantId } });
  if (!course) throw NotFound('Course not found');
  const count = await prisma.module.count({ where: { courseId: dto.courseId } });
  return prisma.module.create({
    data: {
      tenantId,
      courseId: dto.courseId,
      title: dto.title,
      description: dto.description,
      orderIndex: dto.orderIndex ?? count,
      assessmentId: dto.assessmentId,
    },
  });
}

export async function addLesson(tenantId: string, dto: Record<string, unknown>) {
  const moduleId = String(dto.moduleId);
  const module = await prisma.module.findFirst({ where: { id: moduleId, tenantId }, include: { lessons: true } });
  if (!module) throw NotFound('Module not found');
  const order = typeof dto.orderIndex === 'number' ? (dto.orderIndex as number) : module.lessons.length;
  await prisma.lesson.create({
    data: {
      moduleId,
      title: String(dto.title ?? ''),
      type: dto.type as LessonType,
      contentUrl: dto.contentUrl ? String(dto.contentUrl) : undefined,
      orderIndex: order,
      description: dto.description ? String(dto.description) : undefined,
      duration: typeof dto.duration === 'number' ? (dto.duration as number) : undefined,
      fileSize: typeof dto.fileSize === 'number' ? (dto.fileSize as number) : undefined,
      captions: (dto.captions as Prisma.InputJsonValue) ?? undefined,
      quiz: (dto.quiz as Prisma.InputJsonValue) ?? undefined,
    },
  });
  return prisma.module.findUnique({ where: { id: moduleId }, include: { lessons: { orderBy: { orderIndex: 'asc' } } } });
}

export async function updateModuleOrder(tenantId: string, courseId: string, moduleIds: string[]) {
  const course = await prisma.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) throw NotFound('Course not found');
  await prisma.$transaction(
    moduleIds.map((id, index) =>
      prisma.module.updateMany({ where: { id, courseId, tenantId }, data: { orderIndex: index } }),
    ),
  );
  return prisma.course.findUnique({ where: { id: courseId }, include: MODULES_INCLUDE });
}

export async function updateLessonOrder(tenantId: string, moduleId: string, lessonIndices: number[]) {
  const module = await prisma.module.findFirst({
    where: { id: moduleId, tenantId },
    include: { lessons: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!module) throw NotFound('Module not found');
  const reordered = lessonIndices.map((index) => module.lessons[index]).filter(Boolean);
  await prisma.$transaction(
    reordered.map((lesson, index) =>
      prisma.lesson.update({ where: { id: lesson.id }, data: { orderIndex: index } }),
    ),
  );
  return prisma.module.findUnique({ where: { id: moduleId }, include: { lessons: { orderBy: { orderIndex: 'asc' } } } });
}

/**
 * Create a master course in the relational Course collection (legacy
 * createMasterCourse): a Course with isMaster=true plus Module/Lesson rows
 * flattened from the incoming 3-tier `modules`/`subModules` payload.
 */
export async function createMasterCourse(authorId: string, courseData: Record<string, unknown>) {
  const selectedTenants = (courseData.selectedTenants as string[]) || [];
  const incomingModules = (courseData.modules as Array<Record<string, unknown>>) || [];

  const course = await prisma.course.create({
    data: {
      title: String(courseData.title ?? ''),
      description: courseData.description ? String(courseData.description) : '',
      category: courseData.category ? String(courseData.category) : undefined,
      thumbnailUrl: courseData.thumbnail ? String(courseData.thumbnail) : undefined,
      authorId,
      isMaster: true,
      status: 'Draft',
      selectedTenants: selectedTenants.length
        ? { create: selectedTenants.map((tenantId) => ({ tenantId })) }
        : undefined,
      modules: {
        create: incomingModules.map((moduleData, moduleIndex) => ({
          title: String(moduleData.title ?? ''),
          orderIndex: moduleIndex,
          lessons: {
            create: ((moduleData.subModules as Array<Record<string, unknown>>) || []).map((sub, index) => {
              const resourceData = (sub.resourceData as Record<string, unknown>) || {};
              return {
                title: String(sub.title ?? ''),
                type: masterLessonType(sub),
                contentUrl: String(resourceData.videoUrl || resourceData.youtubeUrl || resourceData.fileUrl || ''),
                orderIndex: index,
                isMaster: true,
                quiz: hasQuiz(sub) ? (sub.quiz as Prisma.InputJsonValue) : undefined,
              };
            }),
          },
        })),
      },
    },
    include: MODULES_INCLUDE,
  });

  return course;
}

export async function updateMasterCourse(id: string, courseData: Record<string, unknown>) {
  const course = await prisma.course.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');

  // Replace modules wholesale (legacy deleteMany + recreate).
  await prisma.module.deleteMany({ where: { courseId: id } });

  const incomingModules = (courseData.modules as Array<Record<string, unknown>>) || [];
  const data: Prisma.CourseUpdateInput = {};
  if (courseData.title !== undefined) data.title = String(courseData.title);
  if (courseData.category !== undefined) data.category = String(courseData.category);
  if (courseData.thumbnail) data.thumbnailUrl = String(courseData.thumbnail);

  if (courseData.selectedTenants !== undefined) {
    const tenants = (courseData.selectedTenants as string[]) || [];
    await prisma.courseSelectedTenant.deleteMany({ where: { courseId: id } });
    data.selectedTenants = tenants.length ? { create: tenants.map((tenantId) => ({ tenantId })) } : undefined;
  }

  await prisma.course.update({
    where: { id },
    data: {
      ...data,
      modules: {
        create: incomingModules.map((moduleData, moduleIndex) => ({
          tenantId: null,
          title: String(moduleData.title ?? ''),
          orderIndex: moduleIndex,
          lessons: {
            create: ((moduleData.subModules as Array<Record<string, unknown>>) || []).map((sub, index) => {
              const resourceData = (sub.resourceData as Record<string, unknown>) || {};
              return {
                title: String(sub.title ?? ''),
                type: masterLessonType(sub),
                contentUrl: String(resourceData.videoUrl || resourceData.youtubeUrl || resourceData.fileUrl || ''),
                orderIndex: index,
                isMaster: true,
                quiz: hasQuiz(sub) ? (sub.quiz as Prisma.InputJsonValue) : undefined,
              };
            }),
          },
        })),
      },
    },
  });

  return prisma.course.findUnique({ where: { id }, include: MODULES_INCLUDE });
}

export async function deleteMasterCourse(id: string) {
  const course = await prisma.course.findFirst({ where: { id, isMaster: true } });
  if (!course) throw NotFound('Master course not found');
  await prisma.module.deleteMany({ where: { courseId: id } });
  await prisma.course.delete({ where: { id } });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hasQuiz(sub: Record<string, unknown>): boolean {
  const quiz = sub.quiz as { questions?: unknown[] } | undefined;
  return !!(quiz && Array.isArray(quiz.questions) && quiz.questions.length > 0);
}

function masterLessonType(sub: Record<string, unknown>): LessonType {
  const rt = String(sub.resourceType || '');
  if (rt === 'youtube' || rt === 'video') return 'Video';
  if (rt === 'scorm') return 'SCORM';
  if (rt === 'upload') {
    const resourceData = (sub.resourceData as Record<string, unknown>) || {};
    const file = resourceData.file as { name?: string } | undefined;
    return fileTypeFromName(file?.name);
  }
  const resourceData = (sub.resourceData as Record<string, unknown>) || {};
  if (resourceData.fileUrl) {
    const url = String(resourceData.fileUrl).toLowerCase();
    if (url.includes('.pdf')) return 'PDF';
    if (url.includes('.ppt')) return 'PPT';
    if (url.includes('scorm')) return 'SCORM';
    return 'PDF';
  }
  return 'Text';
}

function fileTypeFromName(name?: string): LessonType {
  if (!name) return 'PDF';
  const ext = name.split('.').pop()?.toLowerCase();
  if (['mp4', 'avi', 'mov', 'webm', 'mkv'].includes(ext || '')) return 'Video';
  if (ext === 'zip') return 'SCORM';
  if (ext === 'pdf') return 'PDF';
  if (['ppt', 'pptx'].includes(ext || '')) return 'PPT';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return 'Text';
  return 'PDF';
}

/**
 * Transform a MasterCourse JSON document into the player's modules→lessons
 * shape. Faithful port of CoursesService.transformMasterCourseForPlayer.
 */
type AnyRec = Record<string, unknown>;
export function transformMasterCourseForPlayer(masterCourse: AnyRec): AnyRec {
  const isYouTubeUrl = (url: string) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)/i.test((url || '').trim());
  const isVimeoUrl = (url: string) => /^(https?:\/\/)?(www\.)?(vimeo\.com\/)/i.test((url || '').trim());

  const getContentType = (resource: AnyRec): string => {
    const type = String(resource.type || '').toLowerCase();
    const url = String(resource.url || resource.contentUrl || resource.fileUrl || '').trim();
    if (isYouTubeUrl(url) || isVimeoUrl(url)) return 'Video';
    if (type.includes('video')) return 'Video';
    if (type.includes('audio')) return 'Audio';
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('ppt') || type.includes('presentation') || type.includes('slide')) return 'PPT';
    if (type.includes('word') || type.includes('doc')) return 'Document';
    if (type.includes('excel') || type.includes('xls')) return 'Document';
    if (type.includes('scorm')) return 'SCORM';
    if (type.includes('quiz')) return 'Quiz';
    if (type === 'rich_text' || type.includes('text') || type.includes('html')) return 'Text';
    if (type === 'external_link' || type === 'iframe_embed') return 'Document';
    return 'Video';
  };

  const transformedModules = ((masterCourse.modules as AnyRec[]) || []).map((module, moduleIndex) => {
    const lessons: AnyRec[] = [];
    const usedLessonIds = new Set<string>();
    let lessonIndex = 0;

    const ensureUniqueLessonId = (proposedId: string, fallbackId: string): string => {
      const normalized = String(proposedId || '').trim();
      if (normalized && !usedLessonIds.has(normalized)) {
        usedLessonIds.add(normalized);
        return normalized;
      }
      let candidate = fallbackId;
      let suffix = 1;
      while (usedLessonIds.has(candidate)) candidate = `${fallbackId}_${suffix++}`;
      usedLessonIds.add(candidate);
      return candidate;
    };

    ((module.subModules as AnyRec[]) || []).forEach((subModule) => {
      const resources = subModule.resources as AnyRec[] | undefined;
      if (resources && resources.length > 0) {
        resources.forEach((resource) => {
          const resourceUrl = String(resource.url || resource.contentUrl || resource.fileUrl || '').trim();
          const contentType = getContentType(resource);
          const lessonObj: AnyRec = {
            _id: ensureUniqueLessonId(String(resource.id || ''), `lesson_${moduleIndex}_${lessonIndex}`),
            title: resource.title || resource.name || `Lesson ${lessonIndex + 1}`,
            type: contentType,
            contentUrl: resourceUrl,
            orderIndex: lessonIndex,
            description: resource.description || subModule.description || '',
            learningObjective: subModule.learningObjective || '',
            duration: resource.duration || subModule.estimatedDuration || 0,
            fileSize: resource.fileSize,
            scormVersion: resource.scormVersion,
            scormEntryPoint: resource.scormEntryPoint,
            metadata: resource.metadata,
            captions: resource.captions || [],
          };
          if (resource.content) lessonObj.content = resource.content;
          if (contentType === 'SCORM' || resource.scormVersion) {
            if (resourceUrl.endsWith('.zip') && resource.scormEntryPoint) {
              const baseUrl = resourceUrl.replace(/\/[^/]+\.zip.*$/, '');
              lessonObj.scormLaunchUrl = `${baseUrl}/${resource.scormEntryPoint}`;
            } else if (resourceUrl) {
              lessonObj.scormLaunchUrl = resourceUrl;
            }
          }
          lessons.push(lessonObj);
          lessonIndex++;
        });
      } else if (subModule.resourceType) {
        const resourceData = (subModule.resourceData as AnyRec) || {};
        const contentUrl = String(
          resourceData.videoUrl || resourceData.youtubeUrl || resourceData.url || resourceData.contentUrl || resourceData.fileUrl || '',
        ).trim();
        let lessonType = 'Video';
        if (isYouTubeUrl(contentUrl) || isVimeoUrl(contentUrl)) lessonType = 'Video';
        if (subModule.resourceType === 'youtube') {
          lessonType = 'Video';
        } else if (subModule.resourceType === 'upload') {
          const fileType = String(resourceData.type || resourceData.mimeType || '').toLowerCase();
          const fileName = String(resourceData.name || resourceData.fileName || contentUrl || '').toLowerCase();
          if (fileType.includes('video') || fileName.endsWith('.mp4') || fileName.endsWith('.webm')) lessonType = 'Video';
          else if (fileType.includes('audio') || fileName.endsWith('.mp3') || fileName.endsWith('.wav')) lessonType = 'Audio';
          else if (fileType.includes('pdf') || fileName.endsWith('.pdf')) lessonType = 'PDF';
          else if (fileType.includes('scorm') || fileName.endsWith('.zip')) lessonType = 'SCORM';
          else lessonType = 'Video';
        }
        const hasRichTextContent = resourceData.content || resourceData.htmlContent || resourceData.body;
        if (contentUrl || hasRichTextContent) {
          const lessonObj: AnyRec = {
            _id: ensureUniqueLessonId(String(subModule.id || ''), `lesson_${moduleIndex}_${lessonIndex}`),
            title: subModule.title || `Lesson ${lessonIndex + 1}`,
            type: hasRichTextContent && !contentUrl ? 'Text' : lessonType,
            contentUrl,
            orderIndex: lessonIndex,
            description: subModule.description || '',
            learningObjective: subModule.learningObjective || '',
            duration: resourceData.duration || subModule.estimatedDuration || 0,
            fileSize: resourceData.fileSize || resourceData.size,
            metadata: resourceData,
          };
          if (hasRichTextContent) lessonObj.content = resourceData.content || resourceData.htmlContent || resourceData.body;
          lessons.push(lessonObj);
          lessonIndex++;
        }
      } else if (subModule.title && !subModule.quiz) {
        const textContent = subModule.learningObjective || subModule.description || '';
        if (textContent) {
          lessons.push({
            _id: ensureUniqueLessonId(String(subModule.id || ''), `lesson_${moduleIndex}_${lessonIndex}`),
            title: subModule.title,
            type: 'Text',
            orderIndex: lessonIndex,
            description: subModule.description || '',
            learningObjective: subModule.learningObjective || '',
            content: textContent,
          });
          lessonIndex++;
        }
      }

      const quiz = subModule.quiz as AnyRec | undefined;
      if (quiz && Array.isArray(quiz.questions) && (quiz.questions as unknown[]).length > 0) {
        lessons.push({
          _id: ensureUniqueLessonId(String(quiz.id || ''), `quiz_${moduleIndex}_${lessonIndex}`),
          title: quiz.title || `${subModule.title} Quiz`,
          type: 'Quiz',
          orderIndex: lessonIndex,
          description: subModule.description || quiz.instructions || '',
          learningObjective: subModule.learningObjective || '',
          assessmentId: quiz.id,
          quizData: quiz,
        });
        lessonIndex++;
      }
    });

    const moduleEndQuiz = module.moduleEndQuiz as AnyRec | undefined;
    if (moduleEndQuiz && Array.isArray(moduleEndQuiz.questions) && (moduleEndQuiz.questions as unknown[]).length > 0) {
      lessons.push({
        _id: ensureUniqueLessonId(String(moduleEndQuiz.id || ''), `module_quiz_${moduleIndex}`),
        title: moduleEndQuiz.title || `${module.title} Assessment`,
        type: 'Quiz',
        orderIndex: lessonIndex,
        description: module.description || moduleEndQuiz.instructions || '',
        learningObjective: module.learningObjective || '',
        assessmentId: moduleEndQuiz.id,
        quizData: moduleEndQuiz,
      });
    }

    // Surface the module-level quiz so the course viewer's "Take Quiz" gate
    // (which reads module.assessmentId) appears. Prefer the moduleEndQuiz, else
    // the first quiz lesson found in this module.
    const moduleEndQuizForId = module.moduleEndQuiz as AnyRec | undefined;
    const quizLesson = lessons.find((l) => l.type === 'Quiz' && l.assessmentId);
    const moduleAssessmentId =
      (moduleEndQuizForId && Array.isArray(moduleEndQuizForId.questions) && (moduleEndQuizForId.questions as unknown[]).length > 0
        ? moduleEndQuizForId.id
        : undefined) || (quizLesson?.assessmentId as string | undefined);

    return {
      _id: module.id || `module_${moduleIndex}`,
      title: module.title,
      orderIndex: module.orderIndex || moduleIndex,
      lessons,
      description: module.description,
      learningObjective: module.learningObjective,
      ...(moduleAssessmentId ? { assessmentId: moduleAssessmentId } : {}),
    };
  });

  return {
    _id: masterCourse.id,
    title: masterCourse.title,
    description: masterCourse.description,
    thumbnailUrl: masterCourse.thumbnailUrl,
    modules: transformedModules,
    category: masterCourse.category,
    level: masterCourse.level,
    estimatedDuration: masterCourse.estimatedDuration,
    settings: masterCourse.settings,
  };
}
