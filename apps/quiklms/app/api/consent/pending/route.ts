import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getPendingConsents } from '@/lib/services/consent-service';

// GET /api/consent/pending
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  return json(await getPendingConsents(user.tenantId as string, user.id));
});
