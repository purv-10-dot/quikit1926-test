import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getMessageableContacts } from '@/lib/services/messages-service';

// GET /api/messages/contacts?q=&role=&batchId= — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const role = url.searchParams.get('role') || undefined;
  const batchId = url.searchParams.get('batchId') || undefined;
  const userRole = actor.role || 'LEARNER';
  return json(
    await getMessageableContacts(actor.orgId ?? '', actor.id, userRole, { q, filterRole: role, batchId }),
  );
});
