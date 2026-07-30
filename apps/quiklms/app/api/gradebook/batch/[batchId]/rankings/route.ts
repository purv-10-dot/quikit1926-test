import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertCanViewBatch } from '@/lib/auth/student-access';
import { getClassRanking } from '@/lib/services/gradebook-service';

// GET /api/gradebook/batch/:batchId/rankings?term=
// Staff-only. A class ranking exposes every classmate's name, email and grade
// in one payload, so this is deliberately stricter than the per-student routes:
// admins, plus the teacher who runs that batch. Was `requireAuth` only, which
// let any learner enumerate their whole cohort's grades and email addresses.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  await assertCanViewBatch(user, params!.batchId);
  const term = new URL(req.url).searchParams.get('term') || undefined;
  return json(await getClassRanking(user.orgId as string, params!.batchId, term));
});
