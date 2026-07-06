import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getRecordings } from '@/lib/services/meetings-service';

// GET /api/meetings/:id/recordings — any authenticated user (tenant-scoped)
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await getRecordings(actor.tenantId!, params!.id));
});
