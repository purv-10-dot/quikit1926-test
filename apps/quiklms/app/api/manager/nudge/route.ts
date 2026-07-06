import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { nudgeBulk } from '@/lib/services/manager-service';

const schema = z.object({ userIds: z.array(z.string()).optional(), message: z.string().optional() });

// POST /api/manager/nudge — MANAGER
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const dto = await parseBody(req, schema);
  return json(await nudgeBulk(user.id, user.tenantId as string, dto));
});
