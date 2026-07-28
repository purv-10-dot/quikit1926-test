import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getRemindersForAdmin } from '@/lib/services/student-reminders-service';

// GET /api/student-reminders/admin?status=&from=&to= — TENANT_ADMIN | SUPER_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUPER_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  return json(await getRemindersForAdmin(actor.orgId!, { status, from, to }));
});
