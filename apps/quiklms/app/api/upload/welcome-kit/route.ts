import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';
import { getObjectBuffer } from '@/lib/s3';

const WELCOME_KIT_KEY = 'welcome-kit/QuikLMS_Welcome_Guide.pdf';

/** Legacy: `if (file.size > 10 * 1024 * 1024)` (upload.controller.ts:93). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/upload/welcome-kit — ADMIN
 *
 * Re-platformed to presigned-PUT: the browser uploads the PDF directly to the
 * fixed welcome-kit key. (Legacy accepted a multipart PDF body.)
 *
 * `fileType` and `fileSize` are REQUIRED. The legacy handler always had the real
 * file in hand and unconditionally enforced both `mimetype === 'application/pdf'`
 * and the 10MB cap (`upload.controller.ts:89-95`). Optional fields — as this
 * route previously declared — let a caller skip both checks by simply omitting
 * them.
 */
const schema = z.object({
  fileType: z.string(),
  fileSize: z.number(),
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const { fileType, fileSize } = await parseBody(req, schema);

  if (fileType !== 'application/pdf') throw BadRequest('Only PDF files are allowed');
  if (fileSize > MAX_BYTES) throw BadRequest('File size must be less than 10MB');

  // Fixed key — overwrite-in-place semantics, like the legacy upload.
  const { uploadUrl, permanentUrl } = await presignForPrefix(
    'welcome-kit',
    'QuikLMS_Welcome_Guide.pdf',
    'application/pdf',
  );
  return json({ success: true, message: 'Welcome Kit upload URL generated', uploadUrl, fileUrl: permanentUrl });
});

/**
 * GET /api/upload/welcome-kit — ADMIN
 *
 * Returns the PDF BYTES, as the legacy handler did (`upload.controller.ts:131-171`:
 * `Content-Type: application/pdf` + `Content-Disposition: attachment`).
 *
 * This route previously returned `{success, fileUrl}` JSON instead — a contract
 * break, since the caller is an `<a download>` link, which would silently save a
 * JSON file named like a PDF. A presigned URL is not a drop-in substitute for a
 * byte stream.
 *
 * Buffering is safe here specifically because this is a single fixed-key,
 * ~MB-scale document capped at 10MB on upload. This is not the large-media path.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);

  let buffer: Buffer;
  try {
    buffer = await getObjectBuffer(WELCOME_KIT_KEY);
  } catch {
    // Legacy collapsed every failure (missing object, S3 error) into this 400.
    throw BadRequest('Welcome Kit PDF not found');
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="QuikLMS_Welcome_Guide.pdf"',
    },
  });
});
