import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';

// POST /api/certificates/upload-signature — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
// S3 upload SKIPPED — file returned as a base64 data URL.
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ success: false, message: 'No file uploaded' });
  if (!file.type.startsWith('image/')) return json({ success: false, message: 'Only image files are allowed' });

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;
  return json({ success: true, data: { url: dataUrl, permanentUrl: dataUrl, dataUrl, s3Key: null } });
});
