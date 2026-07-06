import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { resetQuizAttempts } from '@/lib/services/manager-service';

const schema = z.object({ userId: z.string(), courseId: z.string() });

// PATCH /api/manager/reset-quiz — MANAGER
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const body = await parseBody(req, schema);
  return json(await resetQuizAttempts(user.id, user.tenantId as string, body.userId, body.courseId));
});
