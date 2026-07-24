import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import {
  findOneMaster,
  updateMasterCourse,
  deleteMasterCourse,
  enrichCourseWithPresignedUrls,
} from '@/lib/services/courses-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Same authoring
 * payload as `POST /api/courses/master` (`CourseCreator` posts one and puts the
 * other), but everything is optional — `updateMasterCourse` applies each field
 * only `if (courseData.x !== undefined)`.
 *
 * `title` was the silent corruption here: the service does `String(...)` on it,
 * so `PUT {title: 42}` returned 200 and renamed the course to the string
 * `"42"`. Declaring the type turns that into a 400.
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

const updateMasterCourseSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  thumbnail: z.string().nullish(),
  modules: z.array(masterModuleSchema).optional(),
  selectedTenants: z.array(z.string()).optional(),
});

// GET /api/courses/master/:id — SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const course = await findOneMaster(params!.id);
  // Legacy enriched this endpoint (`courses.controller.ts:154`); a null course
  // short-circuits, matching `course ? enrich(...) : course`.
  const data = course ? await enrichCourseWithPresignedUrls(course as Record<string, unknown>) : course;
  return json({ success: true, data });
});

// PUT /api/courses/master/:id — SUPER_ADMIN
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const body = await parseBody(req, updateMasterCourseSchema);
  const data = await updateMasterCourse(params!.id, body as Record<string, unknown>);
  return json({ success: true, data, message: 'Master course updated successfully' });
});

// DELETE /api/courses/master/:id — SUPER_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  await deleteMasterCourse(params!.id);
  return json({ success: true, message: 'Master course deleted successfully' });
});
