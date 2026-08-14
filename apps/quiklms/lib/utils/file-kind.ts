/**
 * What kind of file does this storage URL point at, and what should we call it?
 *
 * Split out of `components/FilePreviewModal.tsx` so it can be tested in the node
 * Vitest config — that config carries no JSX plugin (see the note in
 * `vitest.unit.config.ts`), so a `.tsx` module cannot even be imported there, and
 * classification is the part with the interesting edge cases.
 *
 * EVERY URL THESE SEE IS PRESIGNED. That is the only kind the read paths hand out,
 * because the bucket is private — so a signature query string is the normal case,
 * not an edge case. It is also what a naive `split('.').pop()` trips over: the
 * last dot in `…/report.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&…` sits inside the
 * signature, not in a file extension.
 */

/** Lower-cased extension of the object a (possibly signed) URL points at. */
export function extensionOf(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Human name for a stored object.
 *
 * `buildPrefixedKey` writes `${Date.now()}-${safeName(fileName)}`, so the raw
 * object name is unreadable until that prefix comes off.
 */
export function fileNameOf(url: string, fallback = 'File'): string {
  try {
    const raw = decodeURIComponent(new URL(url).pathname.split('/').pop() || fallback);
    return raw.replace(/^\d+-/, '') || fallback;
  } catch {
    return fallback;
  }
}

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const VIDEO = ['mp4', 'webm', 'mov', 'ogv'];
const AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];

/**
 * `other` means "the browser cannot show this on its own" — Office formats, zips,
 * anything unrecognised. Those get an open/download card rather than a viewer,
 * deliberately: the Office and Google viewers fetch the URL from their own
 * servers, which is unreliable against a signed, expiring one.
 */
export type FileKind = 'pdf' | 'image' | 'video' | 'audio' | 'other';

export function kindOf(url: string): FileKind {
  const ext = extensionOf(url);
  if (ext === 'pdf') return 'pdf';
  if (IMAGE.includes(ext)) return 'image';
  if (VIDEO.includes(ext)) return 'video';
  if (AUDIO.includes(ext)) return 'audio';
  return 'other';
}
