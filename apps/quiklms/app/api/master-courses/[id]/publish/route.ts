import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * `selectedTenants` is REQUIRED — restoring the legacy contract.
 *
 * `PublishMasterCourseDto` (`courses/dto/master-course.dto.ts:583`) declares it
 * `@IsArray() @IsString({each:true})` with NO `@IsOptional()`, so the NestJS
 * original answered 400 when it was missing. The port made it `.optional()` and
 * defaulted to `[]`, which turned a malformed request into a SILENT WIPE of the
 * course's entire distribution list — publishing a course to nobody while
 * reporting "published successfully".
 *
 * That is how production ended up with 19 tenant-authored published courses that
 * no tenant could see. `setSelectedTenants` now also refuses to drop the
 * authoring tenant, so the two fixes are belt and braces: this one rejects the
 * malformed call, that one bounds the damage of any call that still empties the
 * list deliberately.
 */
const publishSchema = z.object({
  selectedTenants: z.array(z.string(), {
    required_error:
      'selectedTenants is required — publishing without it would remove the course from every tenant.',
  }),
});

// POST /api/master-courses/:id/publish — ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const { selectedTenants } = await parseBody(req, publishSchema);
  const course = await svc.publish(actor, params!.id, selectedTenants);
  return json({ success: true, data: course, message: 'Master course published successfully' });
});
