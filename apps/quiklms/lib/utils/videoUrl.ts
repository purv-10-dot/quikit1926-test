/**
 * Video-host URL recognition — the ONE place these patterns are written down.
 *
 * They used to live twice: once in `UniversalLMSPlayer.tsx` (deciding which
 * player branch a lesson renders in) and once inside
 * `transformMasterCourseForPlayer` in `courses-service.ts` (deciding whether a
 * resource is typed `'Video'` at all). The two copies were textually identical
 * and therefore drifted invisibly — widening one without the other produces a
 * resource that the service does not call a video and the player therefore never
 * reaches, which is far harder to debug than either bug alone.
 *
 * This module must stay free of server-only imports, because a client component
 * imports it too.
 */

/**
 * Hosts and paths are both deliberately wide.
 *
 * Hosts: `m.` is what a phone's share sheet emits, `music.` what the Music app
 * emits, and `youtube-nocookie.com` what a privacy-minded admin pastes. All
 * three resolve to the same video.
 *
 * Paths: `/live/` and `/shorts/` are not exotic. A long lesson is very often a
 * recorded webinar, and YouTube hands those out as `youtube.com/live/<id>`.
 * While the pattern was `watch?v=|embed/|v/` only, such a URL failed detection,
 * fell through to the raw `<video src>` branch, and the browser tried to decode
 * an HTML page as a media file — a black player with no error message. Short
 * clips are usually shared as plain `/watch` links, which is why this read as
 * "long videos don't load".
 *
 * `watch` is matched without its `?v=` so that `watch?app=desktop&v=<id>` — the
 * form the desktop-mode toggle produces — is recognised too.
 */
const YOUTUBE_URL =
  /^(https?:\/\/)?((www|m|music)\.)?(youtube(-nocookie)?\.com\/(watch|embed\/|v\/|live\/|shorts\/)|youtu\.be\/)/i;

const VIMEO_URL = /^(https?:\/\/)?(www\.)?(vimeo\.com\/)/i;

export const isYouTubeUrl = (url: string): boolean => {
  if (!url) return false;
  return YOUTUBE_URL.test(url.trim());
};

export const isVimeoUrl = (url: string): boolean => {
  if (!url) return false;
  return VIMEO_URL.test(url.trim());
};

/**
 * Pull the 11-character video id out of any recognised YouTube URL.
 *
 * `v=` gets its own pattern rather than being anchored to `watch?v=`: YouTube is
 * free to order query params as it likes, and a `watch?v=<id>&list=<playlist>`
 * link must resolve to the video, never to the playlist. It is tried first so
 * that on a `/watch` URL the query wins over any path segment.
 *
 * Trailing params never reach the player — `?si=` share tokens and `&t=`
 * timestamps are dropped here, because only the captured id is handed to
 * `YT.Player`.
 */
export const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/i,
    /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|live\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
};

/** Vimeo ids are numeric, unlike YouTube's opaque 11-char token. */
export const getVimeoVideoId = (url: string): string | null => {
  if (!url) return null;
  const match = url.trim().match(/vimeo\.com\/(\d+)/i);
  return match ? match[1] : null;
};
