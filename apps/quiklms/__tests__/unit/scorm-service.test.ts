import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

const h = vi.hoisted(() => ({ put: vi.fn() }));

// Object storage (GCS) is the only side effect in this module; the zip/manifest
// logic is pure. `put` stands in for `putObject(key, body, contentType)`.
vi.mock('@/lib/s3', () => ({
  putObject: h.put,
  S3_BUCKET: 'test-bucket',
  presignFromUrlOrKey: vi.fn(),
}));

// lib/env validates the whole environment at import time and throws without a
// real .env.
vi.mock('@/lib/env', () => ({ optionalEnv: () => '' }));

import {
  parseScormPackage,
  extractScormFiles,
  injectScormBridge,
  processScormFile,
} from '@/lib/services/scorm-service';

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="M1" version="1.2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG"><organization identifier="ORG"><title>Fire Safety 101</title></organization></organizations>
  <resources><resource identifier="R1" type="webcontent" href="content/start.html"><file href="content/start.html"/></resource></resources>
</manifest>`;

const MANIFEST_2004 = MANIFEST_12.replace(
  '<schemaversion>1.2</schemaversion>',
  '<schemaversion>2004 4th Edition</schemaversion>',
);

async function buildZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(files)) zip.file(k, v);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const HAPPY = () =>
  buildZip({
    'imsmanifest.xml': MANIFEST_12,
    'content/start.html': '<html><head><title>t</title></head><body>hi</body></html>',
    'content/style.css': 'body{}',
  });

beforeEach(() => {
  h.put.mockReset();
  h.put.mockResolvedValue(undefined);
});

describe('parseScormPackage', () => {
  it('extracts the launch url from the first resource href', async () => {
    const parsed = await parseScormPackage(await HAPPY());
    expect(parsed.launchUrl).toBe('content/start.html');
  });

  it('reproduces the legacy title precedence (schemaversion wins over the LOM title)', async () => {
    // Legacy reads metadata[0].schema[0].schemaversion[0] first. With xml2js this
    // path does not resolve for a flat <schema>/<schemaversion> pair, so it falls
    // through to the 'SCORM Course' default rather than the organization title.
    // Pinned deliberately: see the QUESTION raised in the migration summary.
    const parsed = await parseScormPackage(await HAPPY());
    expect(parsed.title).toBe('SCORM Course');
  });

  it('returns the parsed manifest in xml2js shape', async () => {
    const parsed = await parseScormPackage(await HAPPY());
    const manifest = parsed.manifest as Record<string, any>;
    expect(manifest.manifest.resources[0].resource[0].$.href).toBe('content/start.html');
  });

  it('400s when imsmanifest.xml is absent', async () => {
    await expect(parseScormPackage(await buildZip({ 'index.html': '<html></html>' }))).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid SCORM package: imsmanifest.xml not found',
    });
  });

  it('400s when the manifest declares no launch url', async () => {
    const zip = await buildZip({ 'imsmanifest.xml': '<?xml version="1.0"?><manifest><resources></resources></manifest>' });
    await expect(parseScormPackage(zip)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid SCORM package: No launch URL found',
    });
  });

  it('wraps a non-zip buffer in the legacy 400 message', async () => {
    await expect(parseScormPackage(Buffer.from('not a zip'))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Failed to parse SCORM package:'),
    });
  });

  it('only matches imsmanifest.xml at the archive root', async () => {
    // parseScormPackage uses zip.file('imsmanifest.xml') — an exact-path lookup.
    // A nested manifest is NOT found here (processScormFile differs; see below).
    const zip = await buildZip({ 'pkg/imsmanifest.xml': MANIFEST_12 });
    await expect(parseScormPackage(zip)).rejects.toMatchObject({
      message: 'Invalid SCORM package: imsmanifest.xml not found',
    });
  });
});

describe('extractScormFiles', () => {
  it('returns relative paths of files and ignores the extractPath argument', async () => {
    const files = await extractScormFiles(await HAPPY(), '/tmp/scorm');
    expect(files.sort()).toEqual(['content/start.html', 'content/style.css', 'imsmanifest.xml']);
  });

  it('writes nothing — the legacy service never extracted', async () => {
    await extractScormFiles(await HAPPY(), '../../etc/passwd');
    expect(h.put).not.toHaveBeenCalled();
  });
});

describe('injectScormBridge', () => {
  it('injects immediately after an existing <head>', () => {
    const out = injectScormBridge('<html><head><title>x</title></head><body/></html>');
    expect(out.indexOf('__scormBridgeLoaded')).toBeGreaterThan(out.indexOf('<head>'));
    expect(out.indexOf('__scormBridgeLoaded')).toBeLessThan(out.indexOf('<title>'));
  });

  it('synthesizes a head when the document has <html> but no <head>', () => {
    expect(injectScormBridge('<html><body>no head</body></html>')).toContain('<head><script>');
  });

  it('prepends when the document is a bare fragment', () => {
    expect(injectScormBridge('<div>fragment</div>').startsWith('<script>')).toBe(true);
  });

  it('exposes both SCORM 1.2 and 2004 API surfaces', () => {
    const out = injectScormBridge('<html><head></head></html>');
    for (const sym of [
      'window.API=',
      'window.API_1484_11=',
      'LMSInitialize',
      'LMSFinish',
      'LMSGetValue',
      'LMSSetValue',
      'LMSCommit',
      'LMSGetLastError',
      'LMSGetErrorString',
      'LMSGetDiagnostic',
      'Initialize',
      'Terminate',
      'GetValue',
      'SetValue',
      'Commit',
      'GetLastError',
      'GetErrorString',
      'GetDiagnostic',
    ]) {
      expect(out).toContain(sym);
    }
  });

  it('wires the postMessage relay and the inbound scorm-lms listener', () => {
    const out = injectScormBridge('<html><head></head></html>');
    expect(out).toContain("source:'scorm-bridge'");
    expect(out).toContain("source==='scorm-lms'");
    expect(out).toContain("e.data.type==='init-data'");
  });
});

/** Evaluate the injected bridge in a fake window and drive it like a SCORM package. */
function loadBridge() {
  const html = injectScormBridge('<html><head></head><body/></html>');
  const body = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const posted: Array<{ type: string; data: unknown }> = [];
  const listeners: Array<(e: unknown) => void> = [];
  const win: Record<string, any> = {
    addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
    parent: { postMessage: (m: any) => posted.push(m) },
  };
  new Function('window', body)(win);
  return { win, posted, listeners };
}

describe('the injected bridge at runtime', () => {
  it('guards against double-loading', () => {
    const html = injectScormBridge('<html><head></head></html>');
    const body = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const win: Record<string, any> = {
      addEventListener: () => {},
      parent: { postMessage: () => {} },
    };
    new Function('window', body)(win);
    win.API.LMSInitialize();
    win.API.LMSSetValue('cmi.core.score.raw', '50');
    new Function('window', body)(win); // second load must be a no-op
    expect(win.API.LMSGetValue('cmi.core.score.raw')).toBe('50');
  });

  it('announces ready on load', () => {
    const { posted } = loadBridge();
    expect(posted[0]).toMatchObject({ source: 'scorm-bridge', type: 'ready' });
  });

  it('returns error 301 before initialize and services calls synchronously after', () => {
    const { win } = loadBridge();
    expect(win.API.LMSGetValue('cmi.core.lesson_status')).toBe('');
    expect(win.API.LMSGetLastError()).toBe('301');

    expect(win.API.LMSInitialize()).toBe('true');
    expect(win.API.LMSSetValue('cmi.core.score.raw', '88')).toBe('true');
    expect(win.API.LMSGetValue('cmi.core.score.raw')).toBe('88');
    expect(win.API.LMSGetLastError()).toBe('0');
  });

  it('returns error 201 for an empty element name', () => {
    const { win } = loadBridge();
    win.API.LMSInitialize();
    expect(win.API.LMSSetValue('', 'x')).toBe('false');
    expect(win.API.LMSGetLastError()).toBe('201');
  });

  it('auto-completes on LMSFinish when status was never set', () => {
    const { win, posted } = loadBridge();
    win.API.LMSInitialize();
    win.API.LMSFinish();
    const finish = posted.find((p: any) => p.type === 'finish') as any;
    expect(finish.data['cmi.core.lesson_status']).toBe('completed');
  });

  it('does not overwrite a status the package already set', () => {
    const { win, posted } = loadBridge();
    win.API.LMSInitialize();
    win.API.LMSSetValue('cmi.core.lesson_status', 'failed');
    win.API.LMSFinish();
    const finish = posted.find((p: any) => p.type === 'finish') as any;
    expect(finish.data['cmi.core.lesson_status']).toBe('failed');
  });

  it('relays score and completion notifications', () => {
    const { win, posted } = loadBridge();
    win.API.LMSInitialize();
    win.API.LMSSetValue('cmi.core.score.raw', '75');
    win.API.LMSSetValue('cmi.core.lesson_status', 'passed');
    expect(posted.some((p: any) => p.type === 'score' && p.data.score === '75')).toBe(true);
    expect(posted.some((p: any) => p.type === 'completed')).toBe(true);
  });

  it('accepts inbound init-data from the LMS', () => {
    const { win, listeners } = loadBridge();
    listeners[0]({
      data: { source: 'scorm-lms', type: 'init-data', data: { 'cmi.core.lesson_status': 'incomplete' } },
    });
    win.API.LMSInitialize();
    expect(win.API.LMSGetValue('cmi.core.lesson_status')).toBe('incomplete');
  });

  it('keeps the 1.2/2004 GetLastError return-type split (string vs number)', () => {
    const { win } = loadBridge();
    expect(typeof win.API.LMSGetLastError()).toBe('string');
    expect(typeof win.API_1484_11.GetLastError()).toBe('number');
  });

  it('auto-completes on 2004 Terminate', () => {
    const { win, posted } = loadBridge();
    win.API_1484_11.Initialize();
    win.API_1484_11.Terminate();
    const finish = posted.find((p: any) => p.type === 'finish') as any;
    expect(finish.data['cmi.completion_status']).toBe('completed');
  });
});

describe('processScormFile', () => {
  it('uploads every file, then overwrites the entry point with the bridge injected', async () => {
    const result = await processScormFile(await HAPPY(), 'org-1');

    const keys = h.put.mock.calls.map((c) => c[0]);
    // 3 members + 1 bridge-injected overwrite of the entry point.
    expect(keys).toHaveLength(4);
    expect(keys.filter((k: string) => k.endsWith('content/start.html'))).toHaveLength(2);
    expect(keys.every((k: string) => k.startsWith('tenants/org-1/scorm/'))).toBe(true);

    const overwrite = h.put.mock.calls.at(-1)!;
    expect(overwrite[2]).toBe('text/html');
    expect(overwrite[1].toString('utf8')).toContain('__scormBridgeLoaded');
    expect(result.entryPoint).toBe('content/start.html');
    expect(result.launchPath).toBe('content/start.html');
  });

  it('routes master-course packages to the master prefix', async () => {
    await processScormFile(await HAPPY(), 'master');
    const keys = h.put.mock.calls.map((c) => c[0]);
    expect(keys.every((k: string) => k.startsWith('master-courses/scorm/'))).toBe(true);
  });

  it('detects the SCORM version from the manifest schemaversion', async () => {
    const v12 = await processScormFile(await HAPPY(), 'org-1');
    expect(v12.scormVersion).toBe('1.2');

    const v2004 = await processScormFile(
      await buildZip({ 'imsmanifest.xml': MANIFEST_2004, 'content/start.html': '<html><head></head></html>' }),
      'org-1',
    );
    expect(v2004.scormVersion).toBe('2004');
  });

  it('reads the course title from the organization', async () => {
    const result = await processScormFile(await HAPPY(), 'org-1');
    expect(result.title).toBe('Fire Safety 101');
  });

  it('assigns per-file content types', async () => {
    await processScormFile(await HAPPY(), 'org-1');
    const byKey = Object.fromEntries(
      h.put.mock.calls.map((c) => [c[0].split('/scorm/')[1].split('/').slice(1).join('/'), c[2]]),
    );
    expect(byKey['content/style.css']).toBe('text/css');
    expect(byKey['imsmanifest.xml']).toBe('application/xml');
  });

  it('finds a manifest nested under a top-level folder', async () => {
    const result = await processScormFile(
      await buildZip({ 'pkg/imsmanifest.xml': MANIFEST_12, 'pkg/content/start.html': '<html><head></head></html>' }),
      'org-1',
    );
    expect(result.entryPoint).toBe('pkg/content/start.html');
  });

  it('falls back to index.html, then to any html, when the manifest href is unresolvable', async () => {
    const noHref = '<?xml version="1.0"?><manifest><resources><resource identifier="R1"/></resources></manifest>';

    const viaIndex = await processScormFile(
      await buildZip({ 'imsmanifest.xml': noHref, 'index.html': '<html><head></head></html>' }),
      'org-1',
    );
    expect(viaIndex.entryPoint).toBe('index.html');

    const viaAnyHtml = await processScormFile(
      await buildZip({ 'imsmanifest.xml': noHref, 'deep/page.html': '<html><head></head></html>' }),
      'org-1',
    );
    expect(viaAnyHtml.entryPoint).toBe('deep/page.html');
  });

  it('400s when the package has no html entry point', async () => {
    await expect(
      processScormFile(await buildZip({ 'imsmanifest.xml': MANIFEST_12, 'readme.txt': 'x' }), 'org-1'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid SCORM package: no HTML entry point found',
    });
  });

  it('400s when imsmanifest.xml is absent', async () => {
    await expect(processScormFile(await buildZip({ 'index.html': '<html/>' }), 'org-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid SCORM package: imsmanifest.xml not found',
    });
  });

  it('wraps an S3 failure in the legacy 400 message', async () => {
    h.put.mockRejectedValue(new Error('AccessDenied'));
    await expect(processScormFile(await HAPPY(), 'org-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Failed to process SCORM file: AccessDenied',
    });
  });
});
