import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createCourse, findAllForTenant, enrichCoursesWithPresignedUrls } from '@/lib/services/courses-service';

// POST /api/courses — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = actor.orgId;
  if (!orgId) {
    return json({ success: false, message: 'Tenant ID is required', data: [] });
  }
  const dto = await parseBody(req, z.object({}).passthrough());
  const course = await createCourse(orgId, actor.id, dto as Record<string, unknown>);
  return json({ success: true, data: course, message: 'Course created successfully' });
});

// GET /api/courses — any authenticated user (tenant-scoped)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const orgId = actor.orgId;
  if (!orgId) {
    return json({ success: false, message: 'Tenant ID is required', data: [] });
  }
  // Legacy enriched this endpoint (`courses.controller.ts:131`).
  const data = await enrichCoursesWithPresignedUrls(
    (await findAllForTenant(orgId)) as unknown as Record<string, unknown>[],
  );
  return json({ success: true, data });
});
