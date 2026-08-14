import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { bulkAssignCourses } from '@/lib/services/course-assignments-service';
import { tryCreateLog } from '@/lib/services/tenant-audit-service';

const schema = z.object({
  courseIds: z.array(z.string()),
  targetType: z.string(),
  targetIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
});

// POST /api/course-assignments/bulk-assign — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');

  const body = await parseBody(req, schema);
  const results = await bulkAssignCourses(orgId, user.id, body.courseIds, body.targetType as never, body.targetIds, body.dueDate, body.isMandatory);

  // Legacy logs unconditionally here — no `newCount > 0` gate — and always as
  // CourseAssignedToUser regardless of targetType (`controller.ts:202-209`).
  const totalAssigned = results.reduce((sum, r) => sum + r.assigned, 0);
  await tryCreateLog({
    orgId,
    performedBy: user.id,
    actionType: 'CourseAssignedToUser',
    description: `Bulk assigned ${body.courseIds.length} course(s) to ${body.targetIds.length} target(s) (${totalAssigned} total assignments)`,
    metadata: { courseIds: body.courseIds, targetIds: body.targetIds },
  });

  return json({ success: true, data: results, message: `${body.courseIds.length} course(s) assigned to ${body.targetIds.length} target(s)` });
});
