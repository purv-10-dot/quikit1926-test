import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeamCertificates } from '@/lib/services/manager-service';

// GET /api/manager/certificates/download/:managerId — MANAGER
// NOTE: ZIP generation is DEFERRED (S3 fetch + archiver). Returns the issued
// certificate records for the team; PDF/ZIP packaging to be added later.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  if (user.id !== params!.managerId) {
    return json({ success: false, message: 'You can only download certificates for your own team' }, 403);
  }
  const certificates = await getTeamCertificates(params!.managerId, user.orgId as string);
  return json({ success: true, data: certificates });
});
