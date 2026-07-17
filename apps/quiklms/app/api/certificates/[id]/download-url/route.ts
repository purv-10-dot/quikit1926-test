import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { regeneratePdfForIssuedCertificate, getPresignedDownloadUrl } from '@/lib/services/certificates-service';

// GET /api/certificates/:id/download-url — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
//
// Regenerates the PDF against the tenant's current active template, then returns
// a SHORT-LIVED (1h) presigned S3 URL to the freshly uploaded object, so old
// templates are never served.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  if (!user.id) throw new Error('User ID is required');

  const { certificate } = await regeneratePdfForIssuedCertificate(params!.id);
  const url = await getPresignedDownloadUrl(certificate.id, user.orgId ?? null, user.id);
  return json({ success: true, data: { url } });
});
