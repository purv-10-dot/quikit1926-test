import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { generateMissingCertificates } from '@/lib/services/progress-service';

// POST /api/progress/generate-missing-certificates
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const tenantId = user.tenantId;
  const learnerId = user.id;
  if (!tenantId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });
  return json({ success: true, data: await generateMissingCertificates(tenantId, learnerId) });
});
