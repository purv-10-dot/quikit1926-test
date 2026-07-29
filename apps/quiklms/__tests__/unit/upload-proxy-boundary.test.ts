import { describe, it, expect } from 'vitest';

import { UPLOAD_PROXY_MAX_BYTES, MAX_THUMBNAIL_BYTES, MAX_COURSE_RESOURCE_BYTES } from '@/lib/constants/uploads';
import { SERVER_UPLOAD_MAX_BYTES } from '@/lib/upload-client';

/**
 * THE BUG. The browser picked its upload strategy at 4MB
 * (`upload-client.SERVER_UPLOAD_MAX_BYTES`) while the route capped a proxied
 * multipart at a bare `8 * 1024 * 1024` (`upload-service.MAX_PROXY_BYTES`). Two
 * numbers, two files, no link between them.
 *
 * The gap was not academic. A 4-8MB file was sent browser→bucket even though the
 * route would have accepted it happily, and browser→bucket requires a CORS policy
 * on the bucket that `scripts/set-gcs-cors.mjs` cannot apply (the runtime service
 * account has no `storage.buckets.update`). So those uploads failed with "the
 * storage bucket is not accepting uploads from this site" — for no reason other
 * than the two constants disagreeing.
 *
 * Both sides now read UPLOAD_PROXY_MAX_BYTES. These pin the invariant that makes
 * the strategy choice safe: the browser can never pick a path the route refuses.
 */
describe('upload proxy boundary', () => {
  it('is the same number the browser switches on and the route caps at', () => {
    expect(SERVER_UPLOAD_MAX_BYTES).toBe(UPLOAD_PROXY_MAX_BYTES);
  });

  it('defaults to 4MB so an unset environment keeps bodies under Vercel’s 4.5MB cap', () => {
    // The test env sets no NEXT_PUBLIC_UPLOAD_PROXY_MAX_BYTES, so this is the
    // production default. A regression here would start 500ing prod uploads at
    // the platform edge, before any of our code runs.
    expect(UPLOAD_PROXY_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it('never exceeds the largest file the resource routes accept', () => {
    // Proxying more than a route will store would move the failure from a clear
    // client-side size message to a 413 after the bytes were already sent.
    expect(UPLOAD_PROXY_MAX_BYTES).toBeLessThanOrEqual(MAX_COURSE_RESOURCE_BYTES);
  });

  it('floors the thumbnail limit, so course art never lands on the CORS path', () => {
    // What both course components compute. With the default boundary the product
    // limit (5MB) is NOT the effective one — 4MB is — and the error message has to
    // say so, or the author is told a size the upload will still refuse.
    const effective = Math.min(MAX_THUMBNAIL_BYTES, UPLOAD_PROXY_MAX_BYTES);
    expect(effective).toBe(UPLOAD_PROXY_MAX_BYTES);
    expect(effective).toBeLessThan(MAX_THUMBNAIL_BYTES);
  });
});
