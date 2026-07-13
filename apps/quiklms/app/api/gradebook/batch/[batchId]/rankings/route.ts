import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getClassRanking } from '@/lib/services/gradebook-service';

// GET /api/gradebook/batch/:batchId/rankings?term=
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const term = new URL(req.url).searchParams.get('term') || undefined;
  return json(await getClassRanking(user.orgId as string, params!.batchId, term));
});
