import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { manualOverride } from '@/lib/services/manager-service';

// PATCH /api/manager/manual-override — MANAGER
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const body = (await parseBody(req, z.object({}).passthrough())) as { userId: string; action: string; courseId?: string; newDueDate?: string };
  const result = await manualOverride(user.id, user.orgId as string, body);
  return json({ success: true, data: result, message: 'Manual override applied successfully' });
});
