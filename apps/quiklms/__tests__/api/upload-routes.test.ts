import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  getObjectBuffer: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth, requireRoles: h.requireRoles }));
vi.mock('@/lib/env', () => ({ optionalEnv: (k: string) => (k === 'AWS_REGION' ? 'ap-south-1' : 'test-bucket') }));
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  S3_BUCKET: 'test-bucket',
  getObjectBuffer: h.getObjectBuffer,
  presignPut: h.presignPut,
  presignGet: h.presignGet,
  presignFromUrlOrKey: vi.fn(),
  buildUploadKey: (orgId: string, name: string) => `tenants/${orgId}/uploads/uuid-${name}`,
}));

import { Unauthorized } from '@/lib/http';
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

const actor = { id: 'u1', role: 'SUPER_ADMIN', orgId: 'org-1', isActive: true };

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
      'attachment; filename="QuikSkill_Welcome_Guide.pdf"',
    );
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-1.4 fake pdf bytes');
  });

  it('reads the fixed legacy key', async () => {
    h.getObjectBuffer.mockResolvedValue(Buffer.from('x'));
    await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});
    expect(h.getObjectBuffer).toHaveBeenCalledWith('welcome-kit/QuikSkill_Welcome_Guide.pdf');
  });

  it('400s with the legacy message when the object is missing', async () => {
    h.getObjectBuffer.mockRejectedValue(new Error('NoSuchKey'));
    const res = await welcomeKitGET(req('http://x/api/upload/welcome-kit'), {});
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Welcome Kit PDF not found');
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
    expect((await res.json()).message).toBe('Only PDF files are allowed');
  });

  it('400s over the legacy 10MB cap', async () => {
    const res = await welcomeKitPOST(
      req('http://x/api/upload/welcome-kit', { fileType: 'application/pdf', fileSize: 10 * MB + 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('File size must be less than 10MB');
  });

  it('rejects a body that omits fileType/fileSize instead of skipping both checks', async () => {
    // Previously these were optional, so `{}` sailed past the PDF and size checks.
    const res = await welcomeKitPOST(req('http://x/api/upload/welcome-kit', {}), {});
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Validation failed');
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
    expect((await res.json()).message).toBe('Only image files are allowed');
  });

  it('400s over the legacy 5MB cap (manual check → 400, not 413)', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.png', fileType: 'image/png', fileSize: 5 * MB + 1 }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('File size must be less than 5MB');
  });

  it('checks type before size, matching the legacy handler order', async () => {
    const res = await thumbnailPOST(
      req('http://x/api/upload/course-thumbnail', { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 99 * MB }),
      {},
    );
    expect((await res.json()).message).toBe('Only image files are allowed');
  });
});

describe('multer-limit endpoints return 413, not 400', () => {
  // The legacy limits came from `FileInterceptor(..., { limits: { fileSize } })`.
  // Nest's transformException maps multer's LIMIT_FILE_SIZE to
  // PayloadTooLargeException('File too large') → 413.
  const cases = [
    { name: 'course-resource', fn: courseResourcePOST, url: 'http://x/api/upload/course-resource', max: 500 * MB },
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
      expect(body.message).toBe('File too large');
      expect(body.error).toBe('Payload Too Large');
    });

    it(`${name} requires fileSize`, async () => {
      const res = await fn(req(url, { fileName: 'a.bin', fileType: 'application/octet-stream' }), {});
      expect(res.status).toBe(400);
      expect((await res.json()).message).toBe('Validation failed');
    });
  }
});
