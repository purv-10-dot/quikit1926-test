import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findAll } from '@/lib/services/payouts-service';

// GET /api/payouts — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  const year = url.searchParams.get('year');
  const status = url.searchParams.get('status') || undefined;
  const teacherId = url.searchParams.get('teacherId') || undefined;
  const source = url.searchParams.get('source') || undefined;

  if (source && !['batch', 'tutoring'].includes(source)) {
    throw BadRequest('Invalid source value. Must be batch or tutoring');
  }

  return json(
    await findAll(actor.orgId!, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      status,
      teacherId,
      source,
    }),
  );
});
