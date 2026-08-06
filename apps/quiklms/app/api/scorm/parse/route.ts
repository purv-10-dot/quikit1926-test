import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadedFile } from '@/lib/multipart';
import { parseScormPackage } from '@/lib/services/scorm-service';

/** `limits: { fileSize: 500 * 1024 * 1024 }` on the legacy FileInterceptor. */
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * POST /api/scorm/parse — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN | TEACHER
 *
 * Port of `ScormController.parsePackage` (`scorm.controller.ts:25-36`). The
 * service result is returned unwrapped ({ title, launchUrl, manifest }) — the
 * legacy controller applied no envelope here.
 *
 * 201, not 200: Nest's `@Post()` defaults to 201 and this route had no
 * `@HttpCode()` override. Matches the precedent set by `/auth/register` and
 * `/tenants/onboard`, which also pass 201 explicitly.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'TEACHER']);

  const file = await readUploadedFile(req, 'file', MAX_BYTES);
  if (!file) throw BadRequest('SCORM zip file is required');
  if (!file.originalname.endsWith('.zip')) throw BadRequest('File must be a .zip SCORM package');

  return json(await parseScormPackage(file.buffer), 201);
});
