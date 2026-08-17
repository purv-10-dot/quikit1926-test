import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assignCourseToAllLearners } from '@/lib/services/course-assignments-service';
import { tryCreateLog } from '@/lib/services/tenant-audit-service';

const schema = z.object({ courseId: z.string(), dueDate: z.string().optional(), isMandatory: z.boolean().optional() });

// POST /api/course-assignments/assign-all-learners — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');

  const body = await parseBody(req, schema);
  const result = await assignCourseToAllLearners(orgId, user.id, body.courseId, body.dueDate, body.isMandatory);

  await tryCreateLog({
    orgId,
    performedBy: user.id,
    actionType: 'CourseAssignedToUser',
    description: `Assigned course to all learners (${result.assigned}/${result.total})`,
    metadata: { courseId: body.courseId },
  });

  return json({ success: true, data: result, message: `Course assigned to ${result.assigned} of ${result.total} learner(s)` });
});
