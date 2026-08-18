/**
 * Browser-side certificate PDF download.
 *
 * Raw `fetch`, deliberately not the `api` client from `@/lib/api`: the success
 * body is a PDF and `api.get` would run it through `JSON.parse`. Cookies still
 * travel via `credentials: 'include'`.
 *
 * WHY THIS EXISTS. All four call sites (learner certificates, learner
 * dashboard, manager certificates, CelebrationModal) did `await r.blob()` with
 * no status check, so an error response — `{"success":false,"message":"…"}`,
 * 96 bytes of JSON — was written to the user's disk as
 * `<Course>_Certificate.pdf`. Chrome found no `%PDF` header and reported
 * "Failed to load PDF document", the server's actual explanation never reached
 * the learner, and `CelebrationModal` even re-typed the JSON as
 * `application/pdf` on the way out. One helper so that cannot drift back.
 */

/** Server error envelope: the download route sends `message`, `lib/http.ts` sends `error`. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const msg = body?.message ?? body?.error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  } catch {
    /* not JSON — fall through to the generic message */
  }
  return res.status === 403
    ? 'You are not eligible to download this certificate.'
    : 'Failed to download certificate. Please try again.';
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Filename the four call sites already used — kept identical so downloads look unchanged. */
export function certificateFilename(courseName: string): string {
  return `${(courseName || 'Certificate').replace(/[^a-zA-Z0-9\s-]/g, '')}_Certificate.pdf`;
}

/**
 * Download an issued certificate by its row id and save it as `filename`.
 *
 * Throws with the server's own message when the download is refused, so the
 * caller can surface it. Never writes a non-PDF to disk.
 */
export async function downloadCertificatePdf(certificateRowId: string, filename: string): Promise<void> {
  const res = await fetch(`/api/certificates/${certificateRowId}/download`, { credentials: 'include' });

  if (!res.ok) throw new Error(await readErrorMessage(res));

  const blob = await res.blob();

  // A 200 carrying something other than a PDF is still not a PDF. Saving it
  // would reproduce exactly the corrupt-file symptom this helper exists to
  // prevent, so treat it as the error it is.
  const contentType = res.headers.get('Content-Type') || '';
  if (!contentType.includes('application/pdf') || blob.size === 0) {
    throw new Error('The server did not return a certificate PDF. Please try again.');
  }

  saveBlob(blob, filename);
}
