'use client';
/**
 * Browser-side file upload. Two strategies, picked by size.
 *
 * PROXIED (the default, and what quiktrack does for everything —
 * `apps/quiktrack/lib/upload-image.ts` → `/api/docs/upload`): POST the file as
 * multipart to our OWN API route and let the server write it to storage. The
 * request never leaves this origin, so there is no preflight, no bucket CORS
 * policy involved, and a failure comes back as a normal API error with a
 * server-side message and a log line.
 *
 * DIRECT (`> SERVER_UPLOAD_MAX_BYTES`): ask the route for a presigned PUT and
 * send the bytes to storage.googleapis.com ourselves. This exists because a
 * proxied upload cannot exceed the platform's 4.5MB request-body cap and course
 * resources are allowed up to 500MB — a lecture video has nowhere else to go.
 * This hop IS cross-origin and carries a Content-Type header, so the browser
 * preflights it; a bucket with no CORS policy answers that preflight 200 but
 * WITHOUT Access-Control-Allow-Origin, and fetch() then rejects with the bare,
 * unattributable `TypeError: Failed to fetch`. `classifyPutFailure` stops that
 * from surfacing as a mystery; scripts/set-gcs-cors.mjs is the actual fix, and
 * it is bucket metadata that cannot be applied from app config.
 *
 * Both strategies return the same permanent URL and write the same object key —
 * callers cannot tell which one ran.
 */
import { api } from '@/lib/api';

interface UploadResponse {
  /** Present only when the server wants US to send the bytes. */
  uploadUrl?: string;
  permanentUrl?: string;
  url?: string;
  s3Key?: string;
}

/**
 * Largest file we hand to our own API route.
 *
 * Vercel caps a serverless function's request body at 4.5MB and rejects the
 * request before any of our code runs, so this sits under that with room for
 * the multipart envelope. Anything larger has to go direct to the bucket.
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Turn a rejected cross-origin PUT into something a human can act on.
 *
 * A `TypeError` here means the request failed at the network layer — the
 * response was never readable. On the direct path that is overwhelmingly one
 * specific cause (the bucket CORS policy), so name it rather than echoing the
 * browser's generic string. Genuine offline is separated out because it is the
 * one other common cause and has a completely different remedy.
 */
function classifyPutFailure(err: unknown): Error {
  const isNetworkLevel = err instanceof TypeError;
  if (!isNetworkLevel) return err instanceof Error ? err : new Error(String(err));

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new Error('Upload failed — you appear to be offline. Reconnect and try again.');
  }

  return new Error(
    'Upload blocked before it left the browser: the storage bucket is not accepting ' +
      'uploads from this site. This is a one-time CORS setting on the bucket, not a ' +
      'problem with your file — see apps/quiklms/scripts/set-gcs-cors.mjs.',
  );
}

/** Multipart POST to our own route. Same-origin — no preflight, no bucket policy. */
async function uploadThroughServer(file: File, endpoint: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<{ success: boolean; data: UploadResponse }>(endpoint, form);
  const data = res.data;
  const url = data?.permanentUrl || data?.url;
  if (!url) throw new Error('Upload succeeded but no URL was returned');
  return url;
}

/** Mint a signed PUT, then send the bytes straight to the bucket. Cross-origin. */
async function uploadDirectToBucket(file: File, endpoint: string, fileType: string): Promise<string> {
  // 1. Same-origin, so a failure here arrives as a normal API error object with
  //    a server-side message.
  const res = await api.post<{ success: boolean; data: UploadResponse }>(endpoint, {
    fileName: file.name,
    fileType,
    fileSize: file.size,
  });
  const data = res.data;
  if (!data?.uploadUrl) throw new Error('No upload URL returned');

  // 2. Cross-origin — see the module note.
  let put: Response;
  try {
    put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: file,
    });
  } catch (err) {
    // Keep the raw cause in the console for whoever is debugging; the thrown
    // error is the one the UI will render.
    console.error('[upload] presigned PUT failed at the network layer:', err);
    throw classifyPutFailure(err);
  }

  // A signed URL that reached the bucket and was refused — expired signature, or
  // a Content-Type that does not match the one it was signed for.
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return data.permanentUrl || data.url || '';
}

/**
 * Upload `file` through `endpoint` and return its permanent URL.
 *
 * `endpoint` is one of the /api/upload/* routes; every one of them accepts both
 * request shapes, so the strategy is chosen here and the caller never has to
 * care which one ran.
 */
export async function uploadFile(file: File, endpoint: string): Promise<string> {
  const fileType = file.type || 'application/octet-stream';

  if (file.size <= SERVER_UPLOAD_MAX_BYTES) {
    return uploadThroughServer(file, endpoint);
  }
  return uploadDirectToBucket(file, endpoint, fileType);
}
