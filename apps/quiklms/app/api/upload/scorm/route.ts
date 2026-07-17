import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadedFile } from '@/lib/multipart';
import { processScormFile } from '@/lib/services/scorm-service';
import { presignFromUrlOrKey } from '@/lib/s3';

/**
 * POST /api/upload/scorm — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `UploadController.uploadScorm` (`upload.controller.ts:262-310`).
 *
 * Unlike the other upload routes, this one genuinely needs the bytes: the server
 * must read `imsmanifest.xml` and rewrite the entry-point HTML to inject the
 * SCORM API bridge before the package can run. A presigned PUT cannot do either,
 * which is why this endpoint keeps its multipart contract.
 *
 * The legacy FileInterceptor here carried no `limits`, so the upload is unbounded
 * — reproduced.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const file = await readUploadedFile(req, 'file');
  if (!file) throw BadRequest('No file uploaded');
  if (!file.originalname.endsWith('.zip')) {
    throw BadRequest('Only ZIP files are allowed for SCORM packages');
  }

  // Master-vs-tenant branch, transliterated from the original and matching the
  // sibling `/api/upload/course-resource:26`. See QUESTION in the migration
  // summary: `getAuthContext` never returns a null `orgId`, so the master branch
  // is unreachable here — carried over as-is rather than silently redefined.
  const orgId = actor.orgId;
  const isMasterCourse = !orgId && actor.role === 'SUPER_ADMIN';
  const effectiveOrgId = isMasterCourse ? 'master' : orgId;
  if (!effectiveOrgId) throw BadRequest('Tenant ID is required');

  const result = await processScormFile(file.buffer, effectiveOrgId);
  const indexPresignedUrl = await presignFromUrlOrKey(result.indexHtmlUrl);

  return json(
    {
      success: true,
      data: {
        indexHtmlUrl: indexPresignedUrl || result.indexHtmlUrl,
        url: indexPresignedUrl || result.indexHtmlUrl,
        fileUrl: result.indexHtmlUrl,
        manifest: result.manifest,
        title: result.title,
        scormVersion: result.scormVersion,
        entryPoint: result.entryPoint,
        launchPath: result.launchPath,
        type: result.scormVersion === '2004' ? 'scorm_2004' : 'scorm_12',
      },
      message: 'SCORM package processed successfully',
    },
    201,
  );
});
