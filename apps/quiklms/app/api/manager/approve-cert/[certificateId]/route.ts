import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { approveCertificate } from '@/lib/services/manager-service';

// PATCH /api/manager/approve-cert/:certificateId — MANAGER
export const PATCH = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  return json(await approveCertificate(user.id, user.tenantId as string, params!.certificateId));
});
