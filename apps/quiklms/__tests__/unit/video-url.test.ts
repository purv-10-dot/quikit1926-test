/**
 * VIDEO-HOST URL RECOGNITION — regression cover for "the long video won't load".
 *
 * A learner reported that short YouTube lessons played and hour-long ones did
 * not. Duration was a red herring: nothing in the player branches on it. What
 * actually differed was the URL *shape*. A long lesson is usually a recorded
 * webinar, and YouTube shares those as `youtube.com/live/<id>`; a 30-second clip
 * is usually shared as a plain `/watch?v=<id>`. The old pattern accepted only
 * `watch?v=`, `embed/`, `v/` and `youtu.be/`, so the `/live/` URL was not
 * recognised as a video host at all. It fell through to the raw `<video src>`
 * branch, where the browser was handed an HTML page to decode as a media file —
 * a black player, no error, no console message.
 *
 * The same patterns also decide, in `transformMasterCourseForPlayer`, whether a
 * resource is typed 'Video' in the first place. They used to be declared twice,
 * once per call site, which is how the two drifted. They now live in one module
 * and this file is what keeps the accepted set honest.
 *
 * Every case below is a real URL form a tenant admin can paste into the course
 * builder, not a synthetic permutation.
 */
import { describe, it, expect } from 'vitest';
import {
  isYouTubeUrl,
  isVimeoUrl,
  getYouTubeVideoId,
  getVimeoVideoId,
} from '@/lib/utils/videoUrl';

const ID = '2BpCk4d2Cc0';

describe('isYouTubeUrl / getYouTubeVideoId', () => {
  const accepted: Array<[string, string]> = [
    ['plain watch link', `https://www.youtube.com/watch?v=${ID}`],
    ['short share link', `https://youtu.be/${ID}`],
    ['share link with the ?si= token', `https://youtu.be/${ID}?si=qcG-BQTa1a18jHRQ`],
    ['watch link with a timestamp', `https://www.youtube.com/watch?v=${ID}&t=90s`],
    ['watch link inside a playlist', `https://www.youtube.com/watch?v=${ID}&list=PLabc123&index=4`],
    ['watch link with v= not first', `https://www.youtube.com/watch?app=desktop&v=${ID}`],
    ['embed link', `https://www.youtube.com/embed/${ID}`],
    ['legacy /v/ link', `https://www.youtube.com/v/${ID}`],
    ['recorded live stream', `https://www.youtube.com/live/${ID}`],
    ['short-form link', `https://www.youtube.com/shorts/${ID}`],
    ['mobile host', `https://m.youtube.com/watch?v=${ID}`],
    ['music host', `https://music.youtube.com/watch?v=${ID}`],
    ['nocookie embed host', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['no scheme', `youtube.com/watch?v=${ID}`],
    ['surrounding whitespace from a paste', `  https://youtu.be/${ID}  `],
  ];

  it.each(accepted)('accepts a %s and extracts the id', (_label, url) => {
    expect(isYouTubeUrl(url)).toBe(true);
    expect(getYouTubeVideoId(url)).toBe(ID);
  });

  // The two that regressed. Kept separate from the table so a failure names them.
  it('accepts youtube.com/live/<id> — the form a recorded webinar is shared as', () => {
    expect(isYouTubeUrl(`https://www.youtube.com/live/${ID}`)).toBe(true);
  });

  it('resolves watch?v=<id>&list=<playlist> to the video, never the playlist', () => {
    expect(getYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLnotavideoid`)).toBe(ID);
  });

  const rejected: Array<[string, string]> = [
    ['a Vimeo link', 'https://vimeo.com/123456789'],
    ['a direct file URL', 'https://cdn.example.com/courses/module-1.mp4'],
    ['a presigned S3 URL', 'https://bucket.s3.amazonaws.com/tenants/x/v.mp4?X-Amz-Signature=abc'],
    ['an unrelated host', 'https://notyoutube.com/watch?v=abcdefghijk'],
    ['the empty string', ''],
  ];

  it.each(rejected)('rejects %s', (_label, url) => {
    expect(isYouTubeUrl(url)).toBe(false);
  });

  it('returns null rather than a partial id when there is no 11-char token', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull();
    expect(getYouTubeVideoId('https://cdn.example.com/v.mp4')).toBeNull();
    expect(getYouTubeVideoId('')).toBeNull();
  });

  it('never passes share or tracking params through to the player', () => {
    // The id alone is what reaches YT.Player, so `?si=` and `&t=` cannot leak.
    expect(getYouTubeVideoId(`https://youtu.be/${ID}?si=TRACKINGTOKEN&t=42`)).toBe(ID);
  });
});

describe('isVimeoUrl / getVimeoVideoId', () => {
  it('accepts a Vimeo link and extracts the numeric id', () => {
    expect(isVimeoUrl('https://vimeo.com/123456789')).toBe(true);
    expect(getVimeoVideoId('https://vimeo.com/123456789')).toBe('123456789');
  });

  it('rejects non-Vimeo hosts and returns null for a missing id', () => {
    expect(isVimeoUrl(`https://youtu.be/${ID}`)).toBe(false);
    expect(isVimeoUrl('')).toBe(false);
    expect(getVimeoVideoId('https://vimeo.com/notanumber')).toBeNull();
    expect(getVimeoVideoId('')).toBeNull();
  });
});
