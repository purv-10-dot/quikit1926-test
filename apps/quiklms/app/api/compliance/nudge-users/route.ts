import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getNudgeUsers } from '@/lib/services/compliance-service';

// GET /api/compliance/nudge-users — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const nudgeUsers = await getNudgeUsers(user.tenantId as string);
  return json({ success: true, data: nudgeUsers, message: 'Nudge users fetched successfully' });
});
