import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { learnerReset } from '@/lib/services/manager-service';

const schema = z.object({ userId: z.string(), courseId: z.string(), resetType: z.enum(['quiz', 'progress']) });

// PATCH /api/manager/learner-reset — MANAGER
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const dto = await parseBody(req, schema);
  return json(await learnerReset(user.id, user.orgId as string, dto));
});
