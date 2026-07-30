import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadedFile } from '@/lib/multipart';
import { parseScormPackage } from '@/lib/services/scorm-service';

/** `limits: { fileSize: 500 * 1024 * 1024 }` on the legacy FileInterceptor. */
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * POST /api/scorm/validate — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN | TEACHER
 *
 * Port of `ScormController.validatePackage` (`scorm.controller.ts:55-78`).
 *
 * An invalid package is NOT an error response. The legacy handler wrapped the
 * parse in try/catch and returned `{ valid:false, title:null, launchUrl:null,
 * message }` at 201 — a validation *result*, not a failure. Callers branch on
 * `valid === false`, so surfacing the parse error as an envelope would break
 * them. The only paths that produce an error envelope here are the ones the
 * legacy handler also threw from: missing file (400) and oversize (413), both of
 * which are raised before the try/catch.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'TEACHER']);

  const file = await readUploadedFile(req, 'file', MAX_BYTES);
  if (!file) throw BadRequest('SCORM zip file is required');

  try {
    const manifest = await parseScormPackage(file.buffer);
    return json(
      {
        valid: true,
        title: manifest.title,
        launchUrl: manifest.launchUrl,
        message: 'SCORM package is valid',
      },
      201,
    );
  } catch (err: unknown) {
    return json(
      {
        valid: false,
        title: null,
        launchUrl: null,
        message: (err instanceof Error && err.message) || 'Invalid SCORM package',
      },
      201,
    );
  }
});
