import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { bulkAssignCourses } from '@/lib/services/course-assignments-service';

const schema = z.object({
  courseIds: z.array(z.string()),
  targetType: z.string(),
  targetIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
});

// POST /api/course-assignments/bulk-assign — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');

  const body = await parseBody(req, schema);
  const results = await bulkAssignCourses(orgId, user.id, body.courseIds, body.targetType as never, body.targetIds, body.dueDate, body.isMandatory);
  return json({ success: true, data: results, message: `${body.courseIds.length} course(s) assigned to ${body.targetIds.length} target(s)` });
});
