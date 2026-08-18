import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
}));
vi.mock('@/lib/env', () => ({ optionalEnv: () => '' }));
vi.mock('@/lib/s3', () => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  S3_BUCKET: 'test-bucket',
  presignFromUrlOrKey: h.presignFromUrlOrKey,
}));

import { Unauthorized } from '@/lib/http';
import { POST as parsePOST } from '@/app/api/scorm/parse/route';
import { POST as validatePOST } from '@/app/api/scorm/validate/route';
import { POST as extractPOST } from '@/app/api/scorm/extract/route';
import { POST as uploadScormPOST } from '@/app/api/upload/scorm/route';

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="M1" version="1.2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG"><organization identifier="ORG"><title>Fire Safety 101</title></organization></organizations>
  <resources><resource identifier="R1" type="webcontent" href="index.html"/></resources>
</manifest>`;

async function scormZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', MANIFEST);
  zip.file('index.html', '<html><head></head><body>hi</body></html>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function multipartReq(
  url: string,
  file: { buffer: Buffer; name: string } | null,
  fields: Record<string, string> = {},
) {
  const form = new FormData();
  if (file) form.append('file', new Blob([new Uint8Array(file.buffer)]), file.name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request(url, { method: 'POST', body: form }) as never;
}

const actor = { id: 'u1', role: 'TENANT_ADMIN', orgId: 'org-1', isActive: true };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(actor);
  h.requireRoles.mockReturnValue(undefined);
});

describe('POST /api/scorm/parse', () => {
  it('401s when unauthenticated', async () => {
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));
    const res = await parsePOST(await multipartReq('http://x/api/scorm/parse', null), {});
    expect(res.status).toBe(401);
  });

  it('returns the manifest at 201 for a valid package', async () => {
    const res = await parsePOST(
      await multipartReq('http://x/api/scorm/parse', { buffer: await scormZip(), name: 'course.zip' }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.launchUrl).toBe('index.html');
    expect(body.manifest).toBeTruthy();
  });

  it('400s when the file field is missing', async () => {
    const res = await parsePOST(await multipartReq('http://x/api/scorm/parse', null), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('SCORM zip file is required');
  });

  it('400s when the file is not a .zip', async () => {
    const res = await parsePOST(
      await multipartReq('http://x/api/scorm/parse', { buffer: await scormZip(), name: 'course.pdf' }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('File must be a .zip SCORM package');
  });
});

describe('POST /api/scorm/validate', () => {
  it('returns valid:true at 201', async () => {
    const res = await validatePOST(
      await multipartReq('http://x/api/scorm/validate', { buffer: await scormZip(), name: 'c.zip' }),
      {},
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      valid: true,
      title: 'SCORM Course',
      launchUrl: 'index.html',
      message: 'SCORM package is valid',
    });
  });

  it('reports an invalid package as a 201 result, NOT an error envelope', async () => {
    // The legacy handler swallowed parse errors and returned valid:false at 201.
    // Callers branch on `valid === false`, so an error envelope here is a
    // contract break — this is the regression GAP_REPORT §4 called out.
    const empty = await new JSZip().file('readme.txt', 'x').generateAsync({ type: 'nodebuffer' });
    const res = await validatePOST(
      await multipartReq('http://x/api/scorm/validate', { buffer: empty, name: 'c.zip' }),
      {},
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      valid: false,
      title: null,
      launchUrl: null,
      message: 'Invalid SCORM package: imsmanifest.xml not found',
    });
  });

  it('still 400s when no file is supplied', async () => {
    const res = await validatePOST(await multipartReq('http://x/api/scorm/validate', null), {});
    expect(res.status).toBe(400);
  });

  it('does not enforce the .zip extension (the legacy handler did not either)', async () => {
    const res = await validatePOST(
      await multipartReq('http://x/api/scorm/validate', { buffer: await scormZip(), name: 'course.pdf' }),
      {},
    );
    expect(res.status).toBe(201);
    expect((await res.json()).valid).toBe(true);
  });
});

describe('POST /api/scorm/extract', () => {
  it('lists the package files at 201', async () => {
    const res = await extractPOST(
      await multipartReq('http://x/api/scorm/extract', { buffer: await scormZip(), name: 'c.zip' }, {
        extractPath: '/tmp/custom',
      }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.files.sort()).toEqual(['imsmanifest.xml', 'index.html']);
  });

  it('400s when no file is supplied', async () => {
    const res = await extractPOST(await multipartReq('http://x/api/scorm/extract', null), {});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/upload/scorm', () => {
  it('returns the legacy envelope with a presigned index url', async () => {
    h.presignFromUrlOrKey.mockResolvedValue('https://signed.example/index.html?sig=1');

    const res = await uploadScormPOST(
      await multipartReq('http://x/api/upload/scorm', { buffer: await scormZip(), name: 'c.zip' }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('SCORM package processed successfully');
    expect(body.data.indexHtmlUrl).toBe('https://signed.example/index.html?sig=1');
    expect(body.data.url).toBe('https://signed.example/index.html?sig=1');
    // fileUrl keeps the permanent (unsigned) url — legacy shape.
    expect(body.data.fileUrl).toContain('https://storage.googleapis.com/test-bucket/');
    expect(body.data.type).toBe('scorm_12');
    expect(body.data.title).toBe('Fire Safety 101');
    expect(body.data.entryPoint).toBe('index.html');
  });

  it('falls back to the permanent url when presigning yields nothing', async () => {
    h.presignFromUrlOrKey.mockResolvedValue(null);
    const res = await uploadScormPOST(
      await multipartReq('http://x/api/upload/scorm', { buffer: await scormZip(), name: 'c.zip' }),
      {},
    );
    const body = await res.json();
    expect(body.data.indexHtmlUrl).toBe(body.data.fileUrl);
  });

  it('400s on a non-zip upload', async () => {
    const res = await uploadScormPOST(
      await multipartReq('http://x/api/upload/scorm', { buffer: await scormZip(), name: 'c.tar' }),
      {},
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Only ZIP files are allowed for SCORM packages');
  });

  it('400s when no file is uploaded', async () => {
    const res = await uploadScormPOST(await multipartReq('http://x/api/upload/scorm', null), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No file uploaded');
  });
});
