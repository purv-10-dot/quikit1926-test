import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assignCourse, type AssignCourseInput } from '@/lib/services/course-assignments-service';
import { tryCreateLog } from '@/lib/services/tenant-audit-service';

const schema = z.object({
  courseId: z.string(),
  targetType: z.enum(['USER', 'GROUP']),
  targetIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.boolean().optional(),
  skipPrerequisiteCheck: z.boolean().optional(),
});

// POST /api/course-assignments/assign — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  if (!orgId) throw BadRequest('Tenant ID is required');

  const dto = await parseBody(req, schema);
  const result = await assignCourse(orgId, user.id, dto as AssignCourseInput);

  const targetLabel = dto.targetType === 'USER' ? 'user(s)' : 'group(s)';

  // Audit ONLY for newly created assignments — the legacy gated on
  // `result.newCount > 0` (`course-assignments.controller.ts:136`), so a re-assign
  // that skips everything as already-assigned records nothing.
  if (result.newCount > 0) {
    await tryCreateLog({
      orgId,
      performedBy: user.id,
      actionType: dto.targetType === 'USER' ? 'CourseAssignedToUser' : 'CourseAssignedToGroup',
      description: `Assigned course to ${result.newCount} ${targetLabel}`,
      metadata: { courseId: dto.courseId, targetIds: dto.targetIds },
    });
  }

  let message: string;
  if (result.newCount > 0 && result.alreadyAssignedCount === 0) message = `Course assigned to ${result.newCount} ${targetLabel}`;
  else if (result.newCount === 0 && result.alreadyAssignedCount > 0) message = `Course already assigned to all selected ${targetLabel}`;
  else message = `Course assigned to ${result.newCount} ${targetLabel}. ${result.alreadyAssignedCount} already assigned (skipped)`;

  return json({ success: true, data: result.assignments, newCount: result.newCount, alreadyAssignedCount: result.alreadyAssignedCount, message });
});
