import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherPayouts } from '@/lib/services/payouts-service';

// GET /api/payouts/teacher?year= — TEACHER (own payouts)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  const year = new URL(req.url).searchParams.get('year');
  return json(await getTeacherPayouts(actor.tenantId!, actor.id, year ? parseInt(year) : undefined));
});
