/**
 * Upload size limits — the ONE place they are written down.
 *
 * These were previously stated twice, in different units, and disagreed: the
 * resource picker accepted 5GB while the route capped at 500MB, so a big file
 * was accepted by the UI, uploaded, and only then refused with a 413. A limit
 * that lives in two places is a limit that will drift again, so both the form
 * that picks the file and the route that accepts it now import from here.
 *
 * This module must stay free of server-only imports (no prisma, no GCS client),
 * because client components import it too.
 */

const MB = 1024 * 1024;

/**
 * Course resources — video, audio, PDFs, slides.
 *
 * Matches the homework and non-teaching-work limits, so every content upload in
 * the app now shares one number.
 */
export const MAX_COURSE_RESOURCE_BYTES = 50 * MB;

/** Homework attachments. Legacy `limits: { fileSize: 50 * 1024 * 1024 }`. */
export const MAX_HOMEWORK_BYTES = 50 * MB;

/** Non-teaching work attachments. Legacy `limits: { fileSize: 50 * 1024 * 1024 }`. */
export const MAX_NON_TEACHING_BYTES = 50 * MB;

/** Course thumbnails. Legacy manual check at `upload.controller.ts:189`. */
export const MAX_THUMBNAIL_BYTES = 5 * MB;

/**
 * The proxy/direct boundary — the largest file we send through our own API route
 * instead of having the browser PUT it straight to the bucket.
 *
 * WHY IT IS A KNOB AND NOT A CONSTANT. This number is not a property of the app,
 * it is a property of the HOST. Vercel rejects a request body over 4.5MB before
 * any of our code runs, so on Vercel the boundary has to sit under that. A local
 * `next dev` has no such cap: App Router route handlers read the body as a
 * stream, and nothing truncates it.
 *
 * That distinction matters because the direct path is the one that needs a CORS
 * policy on the bucket — bucket metadata that `scripts/set-gcs-cors.mjs` cannot
 * apply with the runtime service account (it lacks `storage.buckets.update`).
 * Until that policy exists, every upload that crosses this boundary fails with
 * "the storage bucket is not accepting uploads from this site". Raising the
 * boundary locally keeps those uploads on the proxied path, which needs no bucket
 * policy at all.
 *
 * Read by BOTH sides — `lib/upload-client.ts` picks the strategy with it and
 * `lib/services/upload-service.ts` caps `parseMultipart` with it — so the browser
 * can never choose a path the route will refuse. It replaced a bare `8 * 1024 *
 * 1024` in the service that already disagreed with the client's 4MB, leaving
 * 4-8MB files on the CORS path even though the route would have accepted them.
 *
 * Unset (production) = 4MB, i.e. exactly the previous behaviour.
 */
export const UPLOAD_PROXY_MAX_BYTES =
  Number(process.env.NEXT_PUBLIC_UPLOAD_PROXY_MAX_BYTES) || 4 * MB;

/** Render a byte count the way the size errors phrase it ("50MB"). */
export function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
