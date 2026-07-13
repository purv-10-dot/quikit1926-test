import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findOne } from '@/lib/services/meetings-service';

// GET /api/meetings/:id — any authenticated user (tenant-scoped)
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await findOne(actor.orgId!, params!.id));
});
