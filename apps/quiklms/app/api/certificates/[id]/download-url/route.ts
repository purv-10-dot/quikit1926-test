import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { regeneratePdfForIssuedCertificate, getDownloadUrl } from '@/lib/services/certificates-service';

// GET /api/certificates/:id/download-url — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
// NOTE: S3 presigning is SKIPPED — the stored pdfUrl/verificationUrl is returned.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  if (!user.id) throw new Error('User ID is required');

  const { certificate } = await regeneratePdfForIssuedCertificate(params!.id);
  const url = await getDownloadUrl(certificate.id, user.tenantId ?? null, user.id);
  return json({ success: true, data: { url } });
});
