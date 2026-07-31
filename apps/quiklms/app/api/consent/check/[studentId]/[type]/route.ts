import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { checkConsent } from '@/lib/services/consent-service';

// GET /api/consent/check/:studentId/:type
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  return json(await checkConsent(user.orgId as string, params!.studentId, params!.type));
});
