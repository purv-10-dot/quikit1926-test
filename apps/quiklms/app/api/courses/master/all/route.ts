import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, orgScope } from '@/lib/auth/context';
import { findAllMaster } from '@/lib/services/courses-service';

// GET /api/courses/master/all — SUPER_ADMIN, scoped to the caller's org unless they are
// the platform operator (see lib/auth/context.ts `orgScope`).
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const data = await findAllMaster(orgScope(actor));
  return json({ success: true, data });
});
