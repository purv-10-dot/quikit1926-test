import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findOne } from '@/lib/services/scheduling-service';

// GET /api/scheduling/classes/:id — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await findOne(actor.orgId!, params!.id));
});
