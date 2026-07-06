import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { markAttendance } from '@/lib/services/manager-service';

const schema = z.object({
  userIds: z.array(z.string()),
  sessionId: z.string(),
  sessionDate: z.string(),
  notes: z.string().optional(),
});

// POST /api/manager/attendance — MANAGER
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const dto = await parseBody(req, schema);
  return json(await markAttendance(user.id, user.tenantId as string, dto));
});
