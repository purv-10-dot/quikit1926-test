/**
 * Upload service — two ways to get bytes into the bucket, one response shape.
 *
 *  1. PROXIED (default, `kind: 'bytes'`). The browser POSTs multipart to our own
 *     API route and the server writes to storage. Same-origin, so no CORS
 *     preflight is involved at any point. This is the pattern quiktrack uses for
 *     every upload (`apps/quiktrack/lib/storage.ts` + `/api/docs/upload`), and
 *     it is why quiktrack never needed a bucket CORS policy.
 *  2. PRESIGNED (`kind: 'url'`). The route mints a signed PUT and the browser
 *     sends the bytes straight to storage.googleapis.com. Kept because a proxied
 *     upload cannot exceed the platform's 4.5MB request-body cap, while content
 *     uploads are capped at 50MB — a 30MB video has nowhere to go but
 *     direct-to-bucket. That hop IS cross-origin and still needs the bucket
 *     CORS policy in scripts/set-gcs-cors.mjs.
 *
 * Both paths write the SAME key format and return the SAME permanent URL, so
 * nothing downstream (rendering, presign-on-read, stored rows) can tell them
 * apart. Key format matches the legacy backend exactly:
 *   tenants/{orgId}/uploads/{uuid}-{fileName}
 * and the specialised prefixes (course-resources, homework, scorm, …).
 */
import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { presignPut, presignGet, putObject, S3_BUCKET } from '@/lib/s3';
import { BadRequest } from '@/lib/http';
import { parseMultipart } from '@/lib/multipart';
import { parseBody } from '@/lib/validation';

/**
 * Canonical permanent URL for a stored object.
 *
 * This used to emit `https://{bucket}.s3.{region}.amazonaws.com/{key}` — a
 * leftover from the S3 era. The GCS migration updated the other two URL
 * builders (`scorm-service.ts`, `certificates-service.ts`) but missed this one,
 * so every course resource, thumbnail, homework file and welcome kit was stored
 * with a URL pointing at a bucket that does not exist. Keep this in the same
 * form those two use.
 */
function publicUrl(key: string): string {
  return `https://storage.googleapis.com/${S3_BUCKET}/${key}`;
}

function safeName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/** Generic upload presign (matches UploadService.generatePresignedUrl). */
export async function generatePresignedUrl(
  orgId: string,
  fileName: string,
  fileType: string,
): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string }> {
  const fileKey = `tenants/${orgId}/uploads/${randomUUID()}-${fileName}`;
  const uploadUrl = await presignPut(fileKey, fileType, 3600);
  return { uploadUrl, fileKey, fileUrl: publicUrl(fileKey) };
}

/**
 * Object key for a prefixed upload. Shared by both paths on purpose — a file
 * stored by the server and one PUT by the browser must be indistinguishable.
 */
function buildPrefixedKey(prefix: string, fileName: string): string {
  return `${prefix}/${Date.now()}-${safeName(fileName)}`;
}

/**
 * Mint a presigned PUT for a given S3 prefix. Used by the course-resource /
 * homework / non-teaching / thumbnail / scorm upload endpoints for files too
 * large to proxy through the route.
 */
export async function presignForPrefix(
  prefix: string,
  fileName: string,
  fileType: string,
): Promise<{ uploadUrl: string; s3Key: string; permanentUrl: string }> {
  const key = buildPrefixedKey(prefix, fileName);
  const uploadUrl = await presignPut(key, fileType, 3600);
  return { uploadUrl, s3Key: key, permanentUrl: publicUrl(key) };
}

/**
 * What the caller asked for: either the bytes themselves (multipart) or just
 * metadata for a presigned URL (JSON). The four upload routes branch on nothing
 * else — every other check they run is identical for both.
 */
export type UploadIntent =
  | { kind: 'bytes'; fileName: string; fileType: string; fileSize: number; buffer: Buffer }
  | { kind: 'url'; fileName: string; fileType: string; fileSize: number };

/**
 * Hard ceiling on a PROXIED body, independent of the per-endpoint limits below
 * it. Those limits describe the file (50MB for a course resource); this one
 * describes what may be buffered in a function's memory. The client never sends
 * multipart above ~4MB, and the platform rejects a body over 4.5MB before it
 * reaches us, so this only fires on a hand-rolled request.
 */
const MAX_PROXY_BYTES = 8 * 1024 * 1024;

const uploadMetaSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
});

/**
 * Read either body shape off the request.
 *
 * The JSON branch keeps the exact zod schema the routes used before, so a body
 * missing `fileSize` still fails validation the same way rather than silently
 * skipping the size checks.
 */
export async function readUploadIntent(req: NextRequest): Promise<UploadIntent> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const { file } = await parseMultipart(req, 'file', MAX_PROXY_BYTES);
    if (!file) throw BadRequest('No file provided');
    return {
      kind: 'bytes',
      fileName: file.originalname,
      // A file picked from some OSes arrives with an empty type; the browser
      // uses the same fallback when signing, so keep them in step.
      fileType: file.mimetype || 'application/octet-stream',
      fileSize: file.size,
      buffer: file.buffer,
    };
  }

  const meta = await parseBody(req, uploadMetaSchema);
  return { kind: 'url', ...meta };
}

/**
 * Store the bytes (proxied) or mint a signed PUT (direct), returning one shape.
 *
 * `uploadUrl` is present ONLY when the caller still has to send the bytes — its
 * absence is how the client knows the upload is already complete.
 *
 * `previewUrl` is a signed GET for the same object. The bucket is PRIVATE, so
 * `permanentUrl` is not renderable on its own: an `<img src>` pointed at it gets
 * a 403 and the browser shows a broken image. Every read path in the app already
 * knows this and attaches a signed sibling (`thumbnailUrlPresigned`, via
 * `presignFromUrlOrKey`) — but that only happens when a record is LOADED, and a
 * screen that has just uploaded a file has nothing loaded yet. Handing the
 * signed URL back with the upload is what lets it render immediately.
 *
 * Signing is a local HMAC — no round trip — and works on the direct path too,
 * where the object does not exist yet: the signature is valid for an hour, well
 * past the PUT that is about to create it.
 */
export async function resolveUpload(
  prefix: string,
  intent: UploadIntent,
): Promise<{ uploadUrl?: string; s3Key: string; permanentUrl: string; previewUrl: string }> {
  if (intent.kind === 'bytes') {
    const key = buildPrefixedKey(prefix, intent.fileName);
    await putObject(key, intent.buffer, intent.fileType);
    return { s3Key: key, permanentUrl: publicUrl(key), previewUrl: await presignGet(key, 3600) };
  }
  const presigned = await presignForPrefix(prefix, intent.fileName, intent.fileType);
  return { ...presigned, previewUrl: await presignGet(presigned.s3Key, 3600) };
}

export async function presignReadUrl(s3Key: string): Promise<string> {
  return presignGet(s3Key, 3600);
}

export function getResourceTypeFromFile(filename: string, mimetype: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mimetype.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video_upload';
  if (mimetype.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio_upload';
  if (ext === 'pdf' || mimetype === 'application/pdf') return 'document_pdf';
  if (['ppt', 'pptx'].includes(ext) || mimetype.includes('presentation')) return 'document_ppt';
  if (['doc', 'docx'].includes(ext) || mimetype.includes('word')) return 'document_word';
  if (['xls', 'xlsx'].includes(ext) || mimetype.includes('spreadsheet')) return 'document_excel';
  return 'document_pdf';
}
