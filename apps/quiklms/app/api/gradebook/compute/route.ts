import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { assertCanViewBatch } from '@/lib/auth/student-access';
import { computeBatchGrades } from '@/lib/services/gradebook-service';

// POST /api/gradebook/compute?batchId=&term=
// A WRITE that recomputes grades for a whole batch — staff only. Was
// `requireAuth` only, so any learner could trigger a recompute for any batch.
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId') || '';
  const term = url.searchParams.get('term') || undefined;
  // Role alone is not enough: it would let one teacher recompute another
  // teacher's batch. Admins pass through unrestricted.
  await assertCanViewBatch(user, batchId);
  return json(await computeBatchGrades(user.orgId as string, batchId, term));
});
