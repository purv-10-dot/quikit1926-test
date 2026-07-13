import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { computeBatchGrades } from '@/lib/services/gradebook-service';

// POST /api/gradebook/compute?batchId=&term=
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId') || '';
  const term = url.searchParams.get('term') || undefined;
  return json(await computeBatchGrades(user.orgId as string, batchId, term));
});
