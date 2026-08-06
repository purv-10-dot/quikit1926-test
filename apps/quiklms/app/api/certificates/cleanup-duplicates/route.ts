import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { removeDuplicateIssuedCertificates } from '@/lib/services/certificates-service';

// POST /api/certificates/cleanup-duplicates — SUPER_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  const removed = await removeDuplicateIssuedCertificates();
  return json({ success: true, message: `Removed ${removed} duplicate certificate(s)`, removed });
});
