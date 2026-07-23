/**
 * An upload must not depend on a bucket CORS policy, and when it unavoidably
 * does, a block must not surface as "Failed to fetch".
 *
 * THE BUG. Every browser upload in this app (course resources, course
 * thumbnails, learner + teacher homework, non-teaching work, the master course
 * studio) minted a signed URL from our own API and then PUT the bytes to
 * storage.googleapis.com. That second hop is cross-origin and carries a
 * Content-Type header, so the browser preflights it. The bucket had no CORS
 * policy, so the preflight came back 200 with no Access-Control-Allow-Origin,
 * the browser refused to send the real request, and fetch() rejected with the
 * bare `TypeError: Failed to fetch` — no status, no body, nothing in the server
 * logs, because the request never reached a server.
 *
 * THE FIX, modelled on quiktrack (`apps/quiktrack/lib/upload-image.ts`): POST
 * the file to our OWN route and let the server write it to storage. Same-origin,
 * so no preflight and no bucket policy. Only files too large to fit through a
 * serverless function body still go direct — and for those the error must still
 * name its cause.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api', () => ({ api: { post: (...a: unknown[]) => post(...a) } }));

const { uploadFile, SERVER_UPLOAD_MAX_BYTES } = await import('@/lib/upload-client');

const UPLOAD_URL = 'https://storage.googleapis.com/quikit-bucket/tenants/t1/course-resources/1-a.pdf';
const PERMANENT_URL = 'https://storage.googleapis.com/quikit-bucket/tenants/t1/course-resources/1-a.pdf';

/** A small file — takes the proxied path. */
function file(name = 'a.pdf', type = 'application/pdf'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

/**
 * A file past the proxy ceiling, without allocating one. Only `name`, `type`
 * and `size` are read before the bytes are handed to a mocked fetch.
 */
function hugeFile(name = 'big.mp4', type = 'video/mp4'): File {
  return { name, type, size: SERVER_UPLOAD_MAX_BYTES + 1 } as unknown as File;
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

describe('an ordinary upload never leaves this origin', () => {
  it('POSTs the file to our own route and returns the permanent URL', async () => {
    post.mockResolvedValue({ success: true, data: { permanentUrl: PERMANENT_URL } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const url = await uploadFile(file(), '/upload/course-resource');

    expect(url).toBe(PERMANENT_URL);
    // No cross-origin PUT happened at all — that is the whole point.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends multipart, so the route can store the bytes server-side', async () => {
    post.mockResolvedValue({ success: true, data: { permanentUrl: PERMANENT_URL } });

    await uploadFile(file(), '/upload/course-resource');

    const [endpoint, body] = post.mock.calls[0];
    expect(endpoint).toBe('/upload/course-resource');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('accepts `url` when the route does not send `permanentUrl`', async () => {
    post.mockResolvedValue({ success: true, data: { url: PERMANENT_URL } });
    expect(await uploadFile(file(), '/upload/course-resource')).toBe(PERMANENT_URL);
  });

  it('fails loudly if the route returns no URL at all', async () => {
    post.mockResolvedValue({ success: true, data: {} });
    await expect(uploadFile(file(), '/upload/course-resource')).rejects.toThrow(/no URL was returned/i);
  });
});

describe('a CORS-blocked PUT on the large-file path explains itself', () => {
  beforeEach(presignOk);

  it('never leaks the browser\'s bare "Failed to fetch"', async () => {
    // Exactly what a browser throws when a preflight is refused.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(uploadFile(hugeFile(), '/upload/course-resource')).rejects.toThrow(
      /storage bucket is not accepting uploads/i,
    );
  });

  it('points at the bucket setting, not at the user\'s file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const err = (await uploadFile(hugeFile(), '/upload/course-resource').catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/CORS/);
    expect(err.message).toMatch(/not a problem with your file/i);
    expect(err.message).not.toMatch(/failed to fetch/i);
  });

  it('reports being offline separately — a different remedy', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(uploadFile(hugeFile(), '/upload/course-resource')).rejects.toThrow(/offline/i);
  });
});

describe('failures that DID reach the bucket keep their own meaning', () => {
  beforeEach(presignOk);

  it('a refused signature surfaces its status, not a CORS message', async () => {
    // 403 = the request arrived and was rejected (expired signature, or a
    // Content-Type that differs from the one the URL was signed for). Blaming
    // CORS here would send the operator to the wrong fix.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const err = (await uploadFile(hugeFile(), '/upload/course-resource').catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('Upload failed (403)');
    expect(err.message).not.toMatch(/CORS/i);
  });

  it('a non-TypeError rejection is passed through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted by user')));

    await expect(uploadFile(hugeFile(), '/upload/course-resource')).rejects.toThrow('aborted by user');
  });

  it('a presign that returns no uploadUrl fails before any PUT', async () => {
    post.mockResolvedValue({ success: true, data: {} });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(uploadFile(hugeFile(), '/upload/course-resource')).rejects.toThrow(/no upload url/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the large-file path is unchanged', () => {
  it('PUTs the bytes with the signed Content-Type and returns the permanent URL', async () => {
    presignOk();
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const url = await uploadFile(hugeFile('a.pdf', 'application/pdf'), '/upload/course-resource');

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

    await uploadFile(hugeFile('blob.bin', ''), '/upload/course-resource');

    expect(post.mock.calls[0][1].fileType).toBe('application/octet-stream');
    expect(fetchSpy.mock.calls[0][1].headers['Content-Type']).toBe('application/octet-stream');
  });

  it('a file exactly at the ceiling still goes through our own route', async () => {
    // Boundary: `<=` proxies, so only a file strictly larger goes direct.
    post.mockResolvedValue({ success: true, data: { permanentUrl: PERMANENT_URL } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const atLimit = { name: 'x.bin', type: 'application/octet-stream', size: SERVER_UPLOAD_MAX_BYTES } as unknown as File;
    await uploadFile(atLimit, '/upload/course-resource');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
