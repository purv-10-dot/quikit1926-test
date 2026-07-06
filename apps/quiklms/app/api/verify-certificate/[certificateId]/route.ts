import { route, json } from '@/lib/http';
import { verifyCertificate } from '@/lib/services/certificates-service';

// GET /api/verify-certificate/:certificateId — PUBLIC (no auth)
export const GET = route(async (_req, { params }) => {
  try {
    const certificate = await verifyCertificate(params!.certificateId);
    if (!certificate) return json({ success: false, message: 'Certificate not found' });
    return json({ success: true, data: certificate });
  } catch (error) {
    return json({ success: false, message: error instanceof Error ? error.message : 'Failed to verify certificate' });
  }
});
