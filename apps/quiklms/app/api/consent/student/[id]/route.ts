import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getConsentHistory } from '@/lib/services/consent-service';

// GET /api/consent/student/:id
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  return json(await getConsentHistory(user.tenantId as string, params!.id));
});
