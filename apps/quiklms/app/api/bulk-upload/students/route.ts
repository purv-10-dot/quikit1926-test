import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { uploadStudents } from '@/lib/services/bulk-upload-service';

// POST /api/bulk-upload/students — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  if (!user.orgId) throw BadRequest('Tenant ID required');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('No file uploaded');
  const content = await file.text();
  return json({ success: true, data: await uploadStudents(user.orgId, content) });
});
