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

/** Render a byte count the way the size errors phrase it ("50MB"). */
export function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
