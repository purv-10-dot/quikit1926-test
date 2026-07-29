import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { approve } from '@/lib/services/certificates-service';

// POST /api/certificates/:id/approve — SUPER_ADMIN
export const POST = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  const certificate = await approve(params!.id, user.id);
  return json({ success: true, data: certificate, message: 'Certificate template approved and activated' });
});
