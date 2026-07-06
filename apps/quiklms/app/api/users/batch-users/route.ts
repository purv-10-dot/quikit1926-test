import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findUsersByIds } from '@/lib/services/users-service';

// GET /api/users/batch-users?ids=a,b,c — users by ids (tenant-scoped)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const idsParam = new URL(req.url).searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  return json({ success: true, data: await findUsersByIds(actor.tenantId!, ids) });
});
