import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { generatePresignedUrl } from '@/lib/services/upload-service';

// POST /api/upload/presigned-url — any authenticated user (TenantGuard)
// File metadata is read from headers (x-file-name / x-file-type / x-file-size),
// matching the legacy controller. Browser PUTs the bytes directly to S3.
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const tenantId = actor.tenantId;
  if (!tenantId) throw BadRequest('Tenant ID is required');
  const fileName = req.headers.get('x-file-name');
  const fileType = req.headers.get('x-file-type');
  if (!fileName || !fileType) throw BadRequest('x-file-name and x-file-type headers are required');
  const url = await generatePresignedUrl(tenantId, fileName, fileType);
  return json({ success: true, data: url });
});
