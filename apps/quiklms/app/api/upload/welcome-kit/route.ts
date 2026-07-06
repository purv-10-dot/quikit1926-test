import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix, presignReadUrl } from '@/lib/services/upload-service';

const WELCOME_KIT_KEY = 'welcome-kit/QuikSkill_Welcome_Guide.pdf';

/**
 * POST /api/upload/welcome-kit — SUPER_ADMIN
 * Re-platformed to presigned-PUT: the browser uploads the PDF directly to the
 * fixed welcome-kit key. (Legacy accepted a multipart PDF body.)
 */
const schema = z.object({ fileType: z.string().optional() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const { fileType } = await parseBody(req, schema);
  if (fileType && fileType !== 'application/pdf') throw BadRequest('Only PDF files are allowed');
  // Fixed key — overwrite-in-place semantics, like the legacy upload.
  const { uploadUrl, permanentUrl } = await presignForPrefix('welcome-kit', 'QuikSkill_Welcome_Guide.pdf', 'application/pdf');
  return json({ success: true, message: 'Welcome Kit upload URL generated', uploadUrl, fileUrl: permanentUrl });
});

/**
 * GET /api/upload/welcome-kit — SUPER_ADMIN
 * Legacy streamed the PDF bytes back. Here we return a presigned GET URL for the
 * fixed welcome-kit key so the client can download directly from S3.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const url = await presignReadUrl(WELCOME_KIT_KEY);
  return json({ success: true, fileUrl: url });
});
