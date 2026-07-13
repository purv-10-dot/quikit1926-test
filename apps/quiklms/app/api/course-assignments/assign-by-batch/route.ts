import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assignCourseByBatch } from '@/lib/services/course-assignments-service';

const schema = z.object({
  courseId: z.string(),
  batchIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
});

// POST /api/course-assignments/assign-by-batch — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');

  const body = await parseBody(req, schema);
  const result = await assignCourseByBatch(orgId, user.id, body.courseId, body.batchIds, body.dueDate, body.isMandatory);
  return json({ success: true, data: result, message: `Course assigned to ${result.assigned} student(s)` });
});
