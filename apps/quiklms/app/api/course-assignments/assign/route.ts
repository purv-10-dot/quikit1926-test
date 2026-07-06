import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assignCourse, type AssignCourseInput } from '@/lib/services/course-assignments-service';

const schema = z.object({
  courseId: z.string(),
  targetType: z.enum(['USER', 'GROUP']),
  targetIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
  skipPrerequisiteCheck: z.boolean().optional(),
});

// POST /api/course-assignments/assign — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const tenantId = user.tenantId;
  if (!tenantId) throw BadRequest('Tenant ID is required');

  const dto = await parseBody(req, schema);
  const result = await assignCourse(tenantId, user.id, dto as AssignCourseInput);

  const targetLabel = dto.targetType === 'USER' ? 'user(s)' : 'group(s)';
  let message: string;
  if (result.newCount > 0 && result.alreadyAssignedCount === 0) message = `Course assigned to ${result.newCount} ${targetLabel}`;
  else if (result.newCount === 0 && result.alreadyAssignedCount > 0) message = `Course already assigned to all selected ${targetLabel}`;
  else message = `Course assigned to ${result.newCount} ${targetLabel}. ${result.alreadyAssignedCount} already assigned (skipped)`;

  return json({ success: true, data: result.assignments, newCount: result.newCount, alreadyAssignedCount: result.alreadyAssignedCount, message });
});
