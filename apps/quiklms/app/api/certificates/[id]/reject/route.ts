import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { reject } from '@/lib/services/certificates-service';

// POST /api/certificates/:id/reject — SUPER_ADMIN
export const POST = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  const body = await parseBody(req, z.object({ reason: z.string().optional() }).passthrough());
  const certificate = await reject(params!.id, user.id, body.reason || 'No reason provided');
  return json({ success: true, data: certificate, message: 'Certificate template rejected' });
});
