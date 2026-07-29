import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findUsersByIds } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

// GET /api/users/batch-users?ids=a,b,c — users by ids (tenant-scoped)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const idsParam = new URL(req.url).searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  const users = await findUsersByIds(actor.orgId!, ids);
  // Not a legacy endpoint, so not covered by the class-level interceptor — but it
  // returns the same rows as /users/by-ids, so leaving it unstripped would be a
  // trivial bypass of the whole privacy rule.
  return json({ success: true, data: await applyTeacherPrivacy(actor, req, users) });
});
