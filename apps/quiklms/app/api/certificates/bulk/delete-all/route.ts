import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { deleteAllTemplates } from '@/lib/services/certificates-service';

// DELETE /api/certificates/bulk/delete-all — SUPER_ADMIN
export const DELETE = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  const count = await deleteAllTemplates();
  return json({ success: true, message: `Successfully deleted ${count} certificate template(s)`, count });
});
