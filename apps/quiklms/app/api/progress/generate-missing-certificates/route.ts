import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { generateMissingCertificates } from '@/lib/services/progress-service';

// POST /api/progress/generate-missing-certificates
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });
  return json({ success: true, data: await generateMissingCertificates(orgId, learnerId) });
});
