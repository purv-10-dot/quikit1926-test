import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findOne, enrichCourseWithPresignedUrls } from '@/lib/services/courses-service';

// GET /api/courses/:id — any authenticated user (tenant-scoped)
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const course = await findOne(params!.id, actor.orgId);
  // Legacy enriched this endpoint (`courses.controller.ts:166`).
  const data = course ? await enrichCourseWithPresignedUrls(course as Record<string, unknown>) : course;
  return json({ success: true, data });
});
