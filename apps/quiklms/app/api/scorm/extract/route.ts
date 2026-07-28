import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { parseMultipart, readField } from '@/lib/multipart';
import { extractScormFiles } from '@/lib/services/scorm-service';

/** `limits: { fileSize: 500 * 1024 * 1024 }` on the legacy FileInterceptor. */
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * POST /api/scorm/extract — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN | TEACHER
 *
 * Port of `ScormController.extractPackage` (`scorm.controller.ts:38-53`).
 *
 * This endpoint does not extract anything, and that is faithful: the legacy
 * service accepted `extractPath`, never used it, and returned the zip's relative
 * paths (`scorm.service.ts:69-85`). The `'/tmp/scorm'` default is kept so the
 * request contract is unchanged, even though the value is inert.
 *
 * Because nothing is written, the path-traversal vector that `extractPath` would
 * otherwise carry stays unreachable — as in the original.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'TEACHER']);

  const { form, file } = await parseMultipart(req, 'file', MAX_BYTES);
  if (!file) throw BadRequest('SCORM zip file is required');

  const extractPath = readField(form, 'extractPath') || '/tmp/scorm';
  const files = await extractScormFiles(file.buffer, extractPath);

  return json({ files, count: files.length }, 201);
});
