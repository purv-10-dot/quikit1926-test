import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createMasterCourse } from '@/lib/services/courses-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * The `master-courses` sibling of this bug: `createMasterCourse` writes
 * `title: String(courseData.title ?? '')`, so `POST {}` returned **200** and
 * persisted a master course with an empty title. `title` is now required.
 *
 * `modules` mirrors `CourseCreator`'s nested authoring payload
 * (module → subModules → resourceData/quiz). It is typed one level deep — an
 * array of objects with an optional `title` and `subModules` — and no deeper:
 * `resourceData` and `quiz` are free-form per resource type and the service
 * reads them defensively (`resourceData.videoUrl || .youtubeUrl || .fileUrl`).
 * The two nested nodes keep `.passthrough()` so an authoring field this port
 * does not know about is preserved rather than silently stripped mid-tree; the
 * TOP level is closed, because that is where the missing `title` was.
 * Note the thumbnail arrives as `thumbnail`, not `thumbnailUrl`; the service
 * maps it to the `thumbnailUrl` column.
 */
const masterSubModuleSchema = z.object({
  title: z.string().nullish(),
  resourceType: z.string().nullish(),
  resourceData: z.record(z.unknown()).nullish(),
  quiz: z.unknown().optional(),
}).passthrough();

const masterModuleSchema = z.object({
  title: z.string().nullish(),
  subModules: z.array(masterSubModuleSchema).nullish(),
}).passthrough();

const createMasterCourseSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().nullish(),
  category: z.string().nullish(),
  thumbnail: z.string().nullish(),
  modules: z.array(masterModuleSchema).optional(),
  selectedTenants: z.array(z.string()).optional(),
});

// POST /api/courses/master — SUPER_ADMIN (master courses are global, no orgId)
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const body = await parseBody(req, createMasterCourseSchema);
  const course = await createMasterCourse(actor.id, body as Record<string, unknown>);
  return json({ success: true, data: course, message: 'Master course created successfully' });
});
