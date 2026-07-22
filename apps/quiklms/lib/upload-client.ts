'use client';
/**
 * Client-side presigned upload.
 *
 * The /api/upload/* routes are presigned-PUT minters: you POST JSON metadata
 * ({ fileName, fileType, fileSize }) and get back an `uploadUrl` that the browser
 * must PUT the bytes to directly (large media never streams through the Next API
 * — Vercel caps a function request body at 4.5MB). This helper does both steps
 * and returns the permanent URL.
 *
 * THE SECOND STEP IS CROSS-ORIGIN. It leaves our domain and lands on
 * storage.googleapis.com, carrying a `Content-Type` header — which makes it a
 * non-simple request, so the browser sends a CORS preflight first. A bucket with
 * no CORS policy answers that preflight `200` but WITHOUT
 * `Access-Control-Allow-Origin`, and the browser then refuses to send the real
 * request. fetch() rejects with the bare, unattributable `TypeError: Failed to
 * fetch` — no status, no body, nothing in the server logs, because the request
 * never reached a server. `classifyPutFailure` below exists to stop that
 * particular error from surfacing as a mystery; see scripts/set-gcs-cors.mjs for
 * the fix, which is bucket metadata and cannot be applied from app config.
 */
import { api } from '@/lib/api';

interface PresignResponse {
  uploadUrl: string;
  permanentUrl?: string;
  url?: string;
  s3Key?: string;
}

/**
 * Turn a rejected cross-origin PUT into something a human can act on.
 *
 * A `TypeError` here means the request failed at the network layer — the
 * response was never readable. In this app that is overwhelmingly one specific
 * cause (the bucket CORS policy), so name it rather than echoing the browser's
 * generic string. Genuine offline is separated out because it is the one other
 * common cause and has a completely different remedy.
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

export async function uploadViaPresign(file: File, endpoint: string): Promise<string> {
  const fileType = file.type || 'application/octet-stream';

  // 1. Mint a presigned PUT URL. Same-origin, so a failure here arrives as a
  //    normal API error object with a server-side message.
  const res = await api.post<{ success: boolean; data: PresignResponse }>(endpoint, {
    fileName: file.name,
    fileType,
    fileSize: file.size,
  });
  const data = res.data;
  if (!data?.uploadUrl) throw new Error('No upload URL returned');

  // 2. PUT the bytes straight to the bucket. Cross-origin — see the module note.
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
