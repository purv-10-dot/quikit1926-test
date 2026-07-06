import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { bulkAssignCourse } from '@/lib/services/manager-service';

const schema = z.object({
  courseId: z.string(),
  userIds: z.array(z.string()),
  dueDate: z.string().optional(),
  isMandatory: z.union([z.boolean(), z.string()]),
});

// POST /api/manager/bulk-assign — MANAGER
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const dto = await parseBody(req, schema);
  return json(await bulkAssignCourse(user.id, user.tenantId as string, dto, user.id));
});
