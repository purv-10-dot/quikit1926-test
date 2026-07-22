import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createCourse, findAllForTenant, enrichCoursesWithPresignedUrls } from '@/lib/services/courses-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `createCourse()` strips `modules`/`selectedTenants` and spreads EVERYTHING
 * ELSE straight into `prisma.lmsCourse.create`. Two consequences the empty
 * schema allowed: a missing `title` (the only non-nullable, non-defaulted
 * column) surfaced as a **500**, and any stray key reached Prisma as an unknown
 * argument. Only real `LmsCourse` columns are declared here; unknown keys are
 * STRIPPED (zod's default), which is strictly more forgiving than the 500 they
 * produce today, so no working client can regress.
 */
const createCourseSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().nullish(),
  category: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  status: z.enum(['Draft', 'Published', 'Archived']).optional(),
  isMaster: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  version: z.number().int().optional(),
  // Accepted, then discarded by createCourse() before the Prisma write.
  modules: z.array(z.unknown()).optional(),
  selectedTenants: z.array(z.string()).optional(),
});

// POST /api/courses — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = actor.orgId;
  if (!orgId) {
    return json({ success: false, message: 'Tenant ID is required', data: [] });
  }
  const dto = await parseBody(req, createCourseSchema);
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
