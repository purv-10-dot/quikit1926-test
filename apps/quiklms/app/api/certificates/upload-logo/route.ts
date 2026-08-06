import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { uploadCertificateAsset } from '@/lib/services/certificates-service';

// POST /api/certificates/upload-logo — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
// See upload-background for why both an S3 object and a base64 data URL come back.
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const form = await req.formData();
  const file = form.get('file');
  // Legacy throws a bare Error here — a 500 'Internal server error', not a 400.
  if (!(file instanceof File)) throw new Error('No file uploaded');
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed');

  const result = await uploadCertificateAsset(
    { buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name, mimeType: file.type },
    'certificates/logos',
    'Storage permission denied. The AWS IAM user does not have s3:PutObject permission. Please update the IAM policy for the S3 bucket.',
  );
  return json(result, 201);
});
