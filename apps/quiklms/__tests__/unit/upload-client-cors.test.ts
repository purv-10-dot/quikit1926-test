/**
 * A blocked cross-origin PUT must not surface as "Failed to fetch".
 *
 * THE BUG. Every browser upload in this app (course resources, course
 * thumbnails, learner + teacher homework, non-teaching work, the master course
 * studio) goes through `uploadViaPresign`: mint a signed URL from our own API,
 * then PUT the bytes to storage.googleapis.com. That second hop is cross-origin
 * and carries a Content-Type header, so the browser preflights it. The bucket
 * had no CORS policy, so the preflight came back 200 with no
 * Access-Control-Allow-Origin, the browser refused to send the real request, and
 * fetch() rejected with the bare `TypeError: Failed to fetch`.
 *
 * That string is a dead end: no status, no response body, and nothing in the
 * server logs — because the request never reached a server. The Resource Manager
 * rendered it verbatim and the operator had no way to tell a bucket
 * misconfiguration from a broken file or a dead network.
 *
 * The bucket policy itself is fixed out of band (scripts/set-gcs-cors.mjs — it
 * is bucket metadata and cannot be set from app config). These tests pin the
 * other half: the failure must always name a cause.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api', () => ({ api: { post: (...a: unknown[]) => post(...a) } }));

const { uploadViaPresign } = await import('@/lib/upload-client');

const UPLOAD_URL = 'https://storage.googleapis.com/quikit-bucket/tenants/t1/course-resources/1-a.pdf';
const PERMANENT_URL = 'https://storage.googleapis.com/quikit-bucket/tenants/t1/course-resources/1-a.pdf';

function file(name = 'a.pdf', type = 'application/pdf'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function presignOk() {
  post.mockResolvedValue({
    success: true,
    data: { uploadUrl: UPLOAD_URL, permanentUrl: PERMANENT_URL },
  });
}

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a CORS-blocked PUT explains itself', () => {
  beforeEach(presignOk);

  it('never leaks the browser\'s bare "Failed to fetch"', async () => {
    // Exactly what a browser throws when a preflight is refused.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(uploadViaPresign(file(), '/upload/course-resource')).rejects.toThrow(
      /storage bucket is not accepting uploads/i,
    );
  });

  it('points at the bucket setting, not at the user\'s file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const err = (await uploadViaPresign(file(), '/upload/course-resource').catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/CORS/);
    expect(err.message).toMatch(/not a problem with your file/i);
    expect(err.message).not.toMatch(/failed to fetch/i);
  });

  it('reports being offline separately — a different remedy', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(uploadViaPresign(file(), '/upload/course-resource')).rejects.toThrow(/offline/i);
  });
});

describe('failures that DID reach the bucket keep their own meaning', () => {
  beforeEach(presignOk);

  it('a refused signature surfaces its status, not a CORS message', async () => {
    // 403 = the request arrived and was rejected (expired signature, or a
    // Content-Type that differs from the one the URL was signed for). Blaming
    // CORS here would send the operator to the wrong fix.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const err = (await uploadViaPresign(file(), '/upload/course-resource').catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('Upload failed (403)');
    expect(err.message).not.toMatch(/CORS/i);
  });

  it('a non-TypeError rejection is passed through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted by user')));

    await expect(uploadViaPresign(file(), '/upload/course-resource')).rejects.toThrow('aborted by user');
  });

  it('a presign that returns no uploadUrl fails before any PUT', async () => {
    post.mockResolvedValue({ success: true, data: {} });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(uploadViaPresign(file(), '/upload/course-resource')).rejects.toThrow(/no upload url/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the happy path is unchanged', () => {
  it('PUTs the bytes with the signed Content-Type and returns the permanent URL', async () => {
    presignOk();
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const url = await uploadViaPresign(file('a.pdf', 'application/pdf'), '/upload/course-resource');

    expect(url).toBe(PERMANENT_URL);
    // The Content-Type must match what the URL was signed for, or GCS 403s.
    const [target, init] = fetchSpy.mock.calls[0];
    expect(target).toBe(UPLOAD_URL);
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/pdf');
  });

  it('falls back to application/octet-stream for a typeless file', async () => {
    presignOk();
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    await uploadViaPresign(file('blob.bin', ''), '/upload/course-resource');

    expect(post.mock.calls[0][1].fileType).toBe('application/octet-stream');
    expect(fetchSpy.mock.calls[0][1].headers['Content-Type']).toBe('application/octet-stream');
  });
});
