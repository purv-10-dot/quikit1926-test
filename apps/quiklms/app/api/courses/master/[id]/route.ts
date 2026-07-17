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
  const body = await parseBody(req, z.object({}).passthrough());
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
