/**
 * Multipart file reading — replaces NestJS `FileInterceptor('file', { limits })`
 * (@nestjs/platform-express + multer) for the routes that genuinely need file
 * bytes server-side (the SCORM package endpoints).
 *
 * Most upload routes in this app were re-architected to presigned PUT and never
 * see bytes; SCORM is the exception, because the server must read the manifest
 * and rewrite the entry-point HTML before the package is usable.
 *
 * Parity notes:
 *  - multer exposes `file.originalname`; the web File API calls it `name`. We
 *    normalize to `originalname` so ported route code reads like the original.
 *  - Exceeding `limits.fileSize` made multer raise LIMIT_FILE_SIZE, which
 *    @nestjs/platform-express surfaces as 413 Payload Too Large. Reproduced.
 */
import type { NextRequest } from 'next/server';
import { BadRequest, PayloadTooLarge } from '@/lib/http';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Read a multipart body once, returning both the parsed form (for `@Body()` text
 * fields) and the named file field. A request body is a single-use stream, so
 * routes needing both — e.g. `POST /scorm/extract` reads `file` + `extractPath` —
 * must go through this rather than calling `formData()` twice.
 *
 * The file is null when the field is absent, mirroring multer's `@UploadedFile()`
 * being undefined; callers do their own "file is required" check, exactly as the
 * legacy controllers did.
 *
 * `maxBytes` mirrors `limits.fileSize`; omit it for an unbounded field (which is
 * what `FileInterceptor('file')` with no limits did).
 */
export async function parseMultipart(
  req: NextRequest,
  field = 'file',
  maxBytes?: number,
): Promise<{ form: FormData; file: UploadedFile | null }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw BadRequest('Invalid multipart/form-data body');
  }
  return { form, file: await extractFile(form, field, maxBytes) };
}

/** Read one file field from a multipart body. */
export async function readUploadedFile(
  req: NextRequest,
  field = 'file',
  maxBytes?: number,
): Promise<UploadedFile | null> {
  const { file } = await parseMultipart(req, field, maxBytes);
  return file;
}

async function extractFile(
  form: FormData,
  field: string,
  maxBytes?: number,
): Promise<UploadedFile | null> {
  const value = form.get(field);
  if (!value || typeof value === 'string') return null;

  const file = value as File;

  // Check the declared size before buffering so an oversized upload is rejected
  // without being read into memory.
  if (maxBytes !== undefined && file.size > maxBytes) {
    throw PayloadTooLarge();
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (maxBytes !== undefined && buffer.length > maxBytes) {
    throw PayloadTooLarge();
  }

  return {
    originalname: file.name,
    mimetype: file.type,
    size: buffer.length,
    buffer,
  };
}

/** Read a non-file text field from the same multipart body. */
export function readField(form: FormData, field: string): string | undefined {
  const v = form.get(field);
  return typeof v === 'string' ? v : undefined;
}
