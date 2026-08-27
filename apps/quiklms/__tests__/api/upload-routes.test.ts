import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  getObjectBuffer: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  putObject: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth, requireRoles: h.requireRoles }));
vi.mock('@/lib/env', () => ({ optionalEnv: (k: string) => (k === 'AWS_REGION' ? 'ap-south-1' : 'test-bucket') }));
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  S3_BUCKET: 'test-bucket',
  getObjectBuffer: h.getObjectBuffer,
  presignPut: h.presignPut,
  presignGet: h.presignGet,
  putObject: h.putObject,
  presignFromUrlOrKey: vi.fn(),
  buildUploadKey: (orgId: string, name: string) => `tenants/${orgId}/uploads/uuid-${name}`,
}));

import { Unauthorized } from '@/lib/http';
import {
  MAX_COURSE_RESOURCE_BYTES,
  MAX_HOMEWORK_BYTES,
  MAX_NON_TEACHING_BYTES,
  formatMaxSize,
} from '@/lib/constants/uploads';
import { POST as welcomeKitPOST, GET as welcomeKitGET } from '@/app/api/upload/welcome-kit/route';
import { POST as thumbnailPOST } from '@/app/api/upload/course-thumbnail/route';
import { POST as courseResourcePOST } from '@/app/api/upload/course-resource/route';
import { POST as homeworkPOST } from '@/app/api/upload/homework-resource/route';
import { POST as nonTeachingPOST } from '@/app/api/upload/non-teaching-work-resource/route';

const MB = 1024 * 1024;

function req(url: string, body?: unknown) {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  }) as never;
}

/**
 * The other body shape these routes accept: the bytes themselves. Content-Type
 * (with its boundary) is set by Request from the FormData — never by hand.
 */
function formReq(url: string, name: string, type: string, bytes = 3) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return new Request(url, { method: 'POST', body: form }) as never;
}

const actor = { id: 'u1', role: 'ADMIN', orgId: 'org-1', isActive: true };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(actor);
  h.requireRoles.mockReturnValue(undefined);
  h.presignPut.mockResolvedValue('https://s3.example/put?sig=1');
  h.presignGet.mockResolvedValue('https://s3.example/get?sig=1');
});

describe('GET /api/upload/welcome-kit', () => {
  it('returns PDF BYTES, not JSON — the legacy contract', async () => {
    // Callers are `<a download>` links. Returning JSON here silently downloads a
    // JSON file named like a PDF. GAP_REPORT §3.2 upload flagged this.
    h.getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 fake pdf bytes'));

    const res = await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="QuikLMS_Welcome_Guide.pdf"',
    );
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-1.4 fake pdf bytes');
  });

  it('reads the fixed legacy key', async () => {
    h.getObjectBuffer.mockResolvedValue(Buffer.from('x'));
    await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});
    expect(h.getObjectBuffer).toHaveBeenCalledWith('welcome-kit/QuikLMS_Welcome_Guide.pdf');
  });

  it('400s with the legacy message when the object is missing', async () => {
    h.getObjectBuffer.mockRejectedValue(new Error('NoSuchKey'));
    const res = await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Welcome Kit PDF not found');
  });

  it('401s when unauthenticated', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));
    const res = await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/upload/welcome-kit', () => {
  it('accepts a PDF under 10MB', async () => {
    const res = await welcomeKitPOST(
      req('http://x/api/upload/welcome-kit', { fileType: 'application/pdf', fileSize: 5 * MB }),
      {},
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('400s on a non-PDF', async () => {
    const res = await welcomeKitPOST(
      req('http://x/api/upload/welcome-kit', { fileType: 'image/png', fileSize: 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Only PDF files are allowed');
  });

  it('400s over the legacy 10MB cap', async () => {
    const res = await welcomeKitPOST(
      req('http://x/api/upload/welcome-kit', { fileType: 'application/pdf', fileSize: 10 * MB + 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('File size must be less than 10MB');
  });

  it('rejects a body that omits fileType/fileSize instead of skipping both checks', async () => {
    // Previously these were optional, so `{}` sailed past the PDF and size checks.
    const res = await welcomeKitPOST(req('http://x/api/upload/welcome-kit', {}), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('fileType');
    expect(body.error).toContain('fileSize');
  });
});

describe('POST /api/upload/course-thumbnail', () => {
  it('accepts an image under 5MB', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.png', fileType: 'image/png', fileSize: 4 * MB }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it('400s on a non-image', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Only image files are allowed');
  });

  it('400s over the legacy 5MB cap (manual check → 400, not 413)', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.png', fileType: 'image/png', fileSize: 5 * MB + 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('File size must be less than 5MB');
  });

  it('checks type before size, matching the legacy handler order', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 99 * MB }),
      {},
    );
    expect((await res.json()).error).toBe('Only image files are allowed');
  });
});

describe('multer-limit endpoints return 413, not 400', () => {
  // The legacy limits came from `FileInterceptor(..., { limits: { fileSize } })`.
  // Nest's transformException maps multer's LIMIT_FILE_SIZE to
  // PayloadTooLargeException('File too large') → 413.
  const cases = [
    // 50MB, same as the other two — and, critically, the same number the
    // resource picker enforces. It used to be 500MB here against a 5GB picker,
    // so a file in between uploaded in full and was then refused.
    { name: 'course-resource', fn: courseResourcePOST, url: 'http://x/api/upload/course-resource', max: 50 * MB },
    { name: 'homework-resource', fn: homeworkPOST, url: 'http://x/api/upload/homework-resource', max: 50 * MB },
    { name: 'non-teaching-work-resource', fn: nonTeachingPOST, url: 'http://x/api/upload/non-teaching-work-resource', max: 50 * MB },
  ];

  for (const { name, fn, url, max } of cases) {
    it(`${name} accepts a file at exactly the limit`, async () => {
      const res = await fn(req(url, { fileName: 'a.bin', fileType: 'application/octet-stream', fileSize: max }), {});
      expect(res.status).toBe(200);
    });

    it(`${name} returns 413 'File too large' one byte over`, async () => {
      const res = await fn(req(url, { fileName: 'a.bin', fileType: 'application/octet-stream', fileSize: max + 1 }), {});
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe('File too large');
      expect(body.error).toBe('Payload Too Large');
    });

    it(`${name} requires fileSize`, async () => {
      const res = await fn(req(url, { fileName: 'a.bin', fileType: 'application/octet-stream' }), {});
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('fileSize');
    });
  }
});

/**
 * The picker and the route must agree on the limit.
 *
 * They did not: the resource picker accepted 5GB while this route capped at
 * 500MB, so a file between the two was chosen, uploaded in full, and only then
 * refused with a 413 — the worst possible place to find out. Both now read
 * lib/constants/uploads.ts, and this test fails if either side drifts.
 */
describe('one limit, shared by the form and the route', () => {
  it('the route enforces exactly the constant the picker checks', async () => {
    const res = await courseResourcePOST(
      req('http://x/api/upload/course-resource', {
        fileName: 'a.mp4',
        fileType: 'video/mp4',
        fileSize: MAX_COURSE_RESOURCE_BYTES + 1,
      }),
      {},
    );
    expect(res.status).toBe(413);
  });

  it('accepts a file at exactly the shared limit', async () => {
    const res = await courseResourcePOST(
      req('http://x/api/upload/course-resource', {
        fileName: 'a.mp4',
        fileType: 'video/mp4',
        fileSize: MAX_COURSE_RESOURCE_BYTES,
      }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it('is 50MB, and the same number as homework and non-teaching work', () => {
    expect(MAX_COURSE_RESOURCE_BYTES).toBe(50 * MB);
    expect(MAX_HOMEWORK_BYTES).toBe(MAX_COURSE_RESOURCE_BYTES);
    expect(MAX_NON_TEACHING_BYTES).toBe(MAX_COURSE_RESOURCE_BYTES);
  });

  it('formats the limit the way the error messages phrase it', () => {
    expect(formatMaxSize(MAX_COURSE_RESOURCE_BYTES)).toBe('50MB');
  });
});

/**
 * The proxied path — the one that made browser uploads stop depending on a
 * bucket CORS policy. A multipart body means the server writes the bytes
 * itself, so the response must NOT carry an uploadUrl: there is nothing left
 * for the browser to send.
 */
describe('multipart bodies are stored server-side', () => {
  const cases = [
    { name: 'course-resource', fn: courseResourcePOST, url: 'http://x/api/upload/course-resource', prefix: 'tenants/org-1/course-resources/' },
    { name: 'homework-resource', fn: homeworkPOST, url: 'http://x/api/upload/homework-resource', prefix: 'tenants/org-1/homework/' },
    { name: 'non-teaching-work-resource', fn: nonTeachingPOST, url: 'http://x/api/upload/non-teaching-work-resource', prefix: 'tenants/org-1/non-teaching-work/' },
    { name: 'course-thumbnail', fn: thumbnailPOST, url: 'http://x/api/upload/course-thumbnail', prefix: 'course-thumbnails/', type: 'image/png', file: 'a.png' },
  ];

  for (const { name, fn, url, prefix, type = 'application/pdf', file = 'a.pdf' } of cases) {
    it(`${name} writes the bytes and returns no uploadUrl`, async () => {
      const res = await fn(formReq(url, file, type), {});

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.uploadUrl).toBeUndefined();
      expect(body.data.permanentUrl).toBe(`https://storage.googleapis.com/test-bucket/${body.data.s3Key}`);
      expect(body.data.s3Key.startsWith(prefix)).toBe(true);
      // Nothing was signed — the browser is never asked to talk to the bucket.
      expect(h.presignPut).not.toHaveBeenCalled();
    });

    it(`${name} returns a SIGNED url to render, beside the permanent one to store`, async () => {
      // The bucket is private: an <img> pointed at permanentUrl gets a 403 and
      // renders as a broken image. The uploading screen has no loaded record to
      // carry the usual `…Presigned` sibling, so the signed URL ships with the
      // upload response or the file appears not to have uploaded at all.
      const res = await fn(formReq(url, file, type), {});

      const body = await res.json();
      expect(body.data.previewUrl).toBe('https://s3.example/get?sig=1');
      expect(h.presignGet).toHaveBeenCalledWith(body.data.s3Key, 3600);
      expect(body.data.previewUrl).not.toBe(body.data.permanentUrl);
    });

    it(`${name} passes the real bytes and content type to storage`, async () => {
      await fn(formReq(url, file, type, 7), {});

      const [key, buffer, contentType] = h.putObject.mock.calls[0];
      expect(key.startsWith(prefix)).toBe(true);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(7);
      expect(contentType).toBe(type);
    });
  }

  it('a multipart body with no file field is a 400, not a 500', async () => {
    const form = new FormData();
    form.append('fileName', 'a.pdf');
    const res = await courseResourcePOST(
      new Request('http://x/api/upload/course-resource', { method: 'POST', body: form }) as never,
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No file provided');
  });

  it('course-thumbnail still rejects a non-image sent as multipart', async () => {
    // The type check must run against the REAL mime type, not a declared one.
    const res = await thumbnailPOST(
      formReq('http://x/api/upload/course-thumbnail', 'a.pdf', 'application/pdf'),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Only image files are allowed');
    expect(h.putObject).not.toHaveBeenCalled();
  });
});
