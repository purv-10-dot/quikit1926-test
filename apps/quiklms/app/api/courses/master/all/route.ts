import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findAllMaster } from '@/lib/services/courses-service';

// GET /api/courses/master/all — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const data = await findAllMaster();
  return json({ success: true, data });
});
